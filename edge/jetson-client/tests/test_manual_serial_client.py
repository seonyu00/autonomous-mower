from datetime import datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import MagicMock
import time

from test_autonomy import load_client
from test_manual_serial_bridge import SerialStub
from jetson_mower_client.manual_serial_bridge import ManualSerialBridge
from jetson_mower_client.manual_serial_protocol import encode_packet
from jetson_mower_client.manual_challenge import ManualChallenge


class ManualSerialClientTest(TestCase):
    def setUp(self):
        client = load_client()
        self.node = client.JetsonMowerClientNode.__new__(client.JetsonMowerClientNode)
        self.node._manual_serial = MagicMock()
        self.node._manual_challenge = ManualChallenge()
        self.node._topics = MagicMock()
        self.node._config = MagicMock()
        self.node._config.robot_id = "robot"
        self.node._manual_serial.arm.return_value = True
        self.node._manual_serial.command.return_value = True
        self.node._mqtt = MagicMock()
        self.node._mqtt.is_connected.return_value = True
        self.node._config.ros.manual_timeout_ms = 500
        self.node._publish_ack = MagicMock()
        self.node._publish_status = MagicMock()
        self.node._stop_autonomy = MagicMock()
        self.node._emergency_active = False

    def test_challenge_rearm_and_move_ignore_wall_clock_and_prevent_replay(self):
        envelope = {"robotId": "robot", "requestedBy": "operator", "lockVersion": 1}
        self.node._handle_manual_challenge({**envelope, "commandId": "request", "parameters": {"purpose": "rearm"}})
        token = self.node._mqtt.publish_json.call_args.args[1]["challenge"]
        self.node._handle_manual_rearm({**envelope, "commandId": "arm", "clientSentAt": "2099-01-01T00:00:00Z",
                                      "parameters": {"challenge": token}}, "now")
        self.assertEqual(self.node._publish_ack.call_args.args[2], "accepted")
        params = {"purpose": "movement", "armId": "arm", "pressId": "press", "direction": "forward", "speed": 0.5}
        self.node._handle_manual_challenge({**envelope, "commandId": "request2", "parameters": params})
        token = self.node._mqtt.publish_json.call_args.args[1]["challenge"]
        command = {**envelope, "clientSentAt": "2099-01-01T00:00:00Z", "parameters": {**params, "challenge": token}}
        self.node._handle_manual(command, "now")
        self.assertEqual(self.node._publish_ack.call_args.args[2], "accepted")
        self.node._handle_manual(command, "now")
        self.assertEqual(self.node._publish_ack.call_args.args[2:4], ("rejected", "manual-challenge-invalid"))

    def test_stop_invalidates_outstanding_movement_challenge(self):
        envelope = {"robotId": "robot", "requestedBy": "operator", "lockVersion": 1}
        params = {"purpose": "movement", "armId": "arm", "pressId": "press", "direction": "forward", "speed": 0.5}
        self.node._handle_manual_challenge({**envelope, "commandId": "request", "parameters": params})
        token = self.node._mqtt.publish_json.call_args.args[1]["challenge"]
        self.node._tick_manual_serial = MagicMock(return_value=True)
        self.node._handle_stop({"parameters": {"armId": "arm", "pressId": "press"}}, "now")
        self.node._handle_manual({**envelope, "parameters": {**params, "challenge": token}}, "now")
        self.assertEqual(self.node._publish_ack.call_args.args[2:4], ("rejected", "manual-challenge-invalid"))
        self.node._manual_serial.command.assert_not_called()

    def test_fresh_rearm_then_manual_carries_arm_and_press_ids(self):
        command = {"commandId": "arm", "clientSentAt": datetime.now(timezone.utc).isoformat()}
        self.node._handle_manual_rearm(command, "now")
        self.node._manual_serial.arm.assert_called_once()
        self.assertEqual(self.node._publish_ack.call_args.args[2], "accepted")
        self.node._handle_manual({"clientSentAt": datetime.now(timezone.utc).isoformat(), "parameters": {
            "armId": "arm", "pressId": "press", "direction": "forward", "speed": 0.5,
        }}, "now")
        self.assertEqual(self.node._manual_serial.command.call_args.args[:4], ("arm", "press", "forward", 0.5))

    def test_old_or_future_rearm_never_enables_serial(self):
        for delta in (timedelta(seconds=-3), timedelta(seconds=3)):
            self.node._handle_manual_rearm({"commandId": "arm", "clientSentAt":
                (datetime.now(timezone.utc) + delta).isoformat()}, "now")
            self.assertEqual(self.node._publish_ack.call_args.args[2], "rejected")
        self.node._manual_serial.arm.assert_not_called()

    def test_mode_change_disarms_manual_and_auto_is_refused(self):
        self.node._tick_manual_serial = MagicMock()
        self.node._publish_status = MagicMock()
        self.node._handle_mode({"parameters": {"mode": "idle"}}, "now")
        self.node._manual_serial.disarm.assert_called_once()
        self.node._handle_mode({"parameters": {"mode": "autonomous"}}, "now")
        self.assertEqual(self.node._publish_ack.call_args.args[2:4], ("rejected", "manual-serial-active"))

    def test_attachment_does_not_claim_blade_control(self):
        self.node._handle_attachment({"parameters": {"attachmentAction": "blade-start"}}, "now")
        self.assertEqual(self.node._publish_ack.call_args.args[2:4], ("rejected", "attachment-not-connected"))

    def test_rearm_move_stop_and_delayed_old_move(self):
        port = SerialStub()
        self.node._manual_serial = ManualSerialBridge(port)
        self.node._manual_serial.tick(time.monotonic())
        port.incoming.extend(b"Remote active: 1 (hold remaining=5000ms)\n")
        self.node._manual_serial.tick(time.monotonic())
        port.incoming.extend(b"Remote active: 0 (hold remaining=0ms)\n")
        self.node._manual_serial.tick(time.monotonic())
        self.node._publish_status = MagicMock()
        self.node._handle_manual_rearm({"commandId": "arm", "clientSentAt": datetime.now(timezone.utc).isoformat()}, "now")
        self.assertEqual(self.node._publish_ack.call_args.args[2], "accepted")
        movement = {"clientSentAt": datetime.now(timezone.utc).isoformat(), "parameters": {
            "armId": "arm", "pressId": "press", "direction": "forward", "speed": 1,
        }}
        self.node._handle_manual(movement, "now")
        self.node._tick_manual_serial()
        self.assertEqual(port.sent[-1], encode_packet(1, 1600, 1600))
        self.node._handle_stop({"parameters": {"armId": "arm", "pressId": "press"}}, "now")
        self.assertEqual(port.sent[-1], encode_packet(0, 1500, 1500))
        self.node._handle_manual(movement, "now")
        self.assertEqual(self.node._publish_ack.call_args.args[2:4], ("rejected", "manual-not-armed"))
        self.node._tick_manual_serial()
        self.assertEqual(port.sent[-1], encode_packet(0, 1500, 1500))

    def test_remote_override_publishes_locked_status(self):
        port = SerialStub()
        self.node._manual_serial = ManualSerialBridge(port)
        self.node._manual_serial.tick(time.monotonic())
        port.incoming.extend(b"Remote active: 1 (hold remaining=5000ms)\n")
        self.node._manual_serial.tick(time.monotonic())
        port.incoming.extend(b"Remote active: 0 (hold remaining=0ms)\n")
        self.node._manual_serial.tick(time.monotonic())
        self.assertTrue(self.node._manual_serial.arm("arm", time.monotonic()))
        port.incoming.extend(b"Remote active: 1 (hold remaining=5000ms)\n")
        self.node._tick_manual_serial()
        self.node._publish_status.assert_called_once()
        self.assertFalse(self.node._manual_serial.armed)
