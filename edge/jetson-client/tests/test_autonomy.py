import importlib.util
import os
import tempfile
import threading
from datetime import datetime, timezone
import sys
from pathlib import Path
from types import ModuleType
import unittest
from unittest.mock import MagicMock, patch

from jetson_mower_client.autonomy import AutonomyExecution
from jetson_mower_client import autonomy_authority
from jetson_mower_client.mission_confirmation import publish_confirmation
from jetson_mower_client.mission_upload import queue_lifecycle
from jetson_mower_client.config import _autonomy_command
from jetson_mower_client.manual_serial_session import ManualSerialSession

MOCK = Path(__file__).parent / "fixtures/autonomy_mock.py"


def load_client():
    names = ["rclpy", "rclpy.node", "rclpy.qos", "rclpy.executors", "geometry_msgs", "geometry_msgs.msg",
             "sensor_msgs", "sensor_msgs.msg", "std_msgs", "std_msgs.msg"]
    modules = {name: ModuleType(name) for name in names}
    modules["rclpy.node"].Node = object
    modules["rclpy.executors"].ExternalShutdownException = type("ExternalShutdownException", (Exception,), {})
    for name in ("DurabilityPolicy", "HistoryPolicy", "QoSProfile", "ReliabilityPolicy"):
        setattr(modules["rclpy.qos"], name, MagicMock())
    for module, types in [("geometry_msgs.msg", ["Twist"]), ("sensor_msgs.msg", ["Imu", "NavSatFix"]), ("std_msgs.msg", ["Bool", "Int8", "String"])]:
        for name in types:
            setattr(modules[module], name, object)
    path = Path(__file__).parents[1] / "jetson_mower_client/main.py"
    spec = importlib.util.spec_from_file_location("jetson_mower_client.main", path)
    client = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(client)
    return client


class AutonomyTest(unittest.TestCase):
    def test_main_cleans_up_after_external_shutdown_or_interrupt(self):
        client = load_client()
        for exception in (client.ExternalShutdownException(), KeyboardInterrupt()):
            with self.subTest(exception=type(exception).__name__):
                ros = MagicMock()
                ros.spin.side_effect = exception
                node = MagicMock()
                with patch.object(client, "rclpy", ros), \
                        patch.object(client, "parse_args", return_value=MagicMock(config="config.yaml")), \
                        patch.object(client, "load_config", return_value=MagicMock()), \
                        patch.object(client, "JetsonMowerClientNode", return_value=node):
                    client.main()
                node.stop.assert_called_once()
                node.destroy_node.assert_called_once()
                ros.try_shutdown.assert_called_once()

    def test_main_does_not_hide_unexpected_spin_error(self):
        client = load_client()
        ros = MagicMock()
        ros.spin.side_effect = ValueError("unexpected")
        node = MagicMock()
        with patch.object(client, "rclpy", ros), \
                patch.object(client, "parse_args", return_value=MagicMock(config="config.yaml")), \
                patch.object(client, "load_config", return_value=MagicMock()), \
                patch.object(client, "JetsonMowerClientNode", return_value=node), \
                self.assertRaisesRegex(ValueError, "unexpected"):
            client.main()
        node.stop.assert_called_once()
        ros.try_shutdown.assert_called_once()

    def test_main_uses_idempotent_ros_shutdown_after_cleanup(self):
        client = load_client()
        ros = MagicMock()
        node = MagicMock()
        config = MagicMock()
        with patch.object(client, "rclpy", ros), \
                patch.object(client, "parse_args", return_value=MagicMock(config="config.yaml")), \
                patch.object(client, "load_config", return_value=config), \
                patch.object(client, "JetsonMowerClientNode", return_value=node):
            client.main()
        node.stop.assert_called_once()
        node.destroy_node.assert_called_once()
        ros.try_shutdown.assert_called_once()
        ros.shutdown.assert_not_called()

    def test_config_rejects_shell_text_and_relative_executable(self):
        self.assertEqual(_autonomy_command({}), ())
        for command in ["bash run.sh", ["run.sh"], [sys.executable, 1]]:
            with self.assertRaises(ValueError):
                _autonomy_command({"command": command})

    def test_missing_config_and_readiness_never_start_process(self):
        with patch("jetson_mower_client.autonomy.subprocess.Popen") as spawn:
            self.assertEqual(AutonomyExecution().request_start(True), "autonomy-not-configured")
            runner = AutonomyExecution([sys.executable, str(MOCK)])
            self.assertEqual(runner.request_start(None), "autonomy-readiness-unknown")
            self.assertEqual(runner.request_start(False), "autonomy-not-ready")
            spawn.assert_not_called()

    def test_launch_failure_is_reported_without_start_signal(self):
        signals = []
        runner = AutonomyExecution([sys.executable], signals.append)
        with patch("jetson_mower_client.autonomy.subprocess.Popen", side_effect=OSError()):
            self.assertEqual(runner.request_start(True), "autonomy-launch-failed")
        self.assertEqual(signals, [])
        self.assertIsNone(runner.run_id)

    def test_cleanup_failure_prevents_new_launch(self):
        runner = AutonomyExecution([sys.executable])
        with patch.object(runner, "stop", side_effect=OSError()), \
                patch("jetson_mower_client.autonomy.subprocess.Popen") as spawn:
            self.assertEqual(runner.request_start(True), "autonomy-stop-unconfirmed")
            spawn.assert_not_called()

    def test_mission_spool_uses_same_id_as_the_execution(self):
        runner = AutonomyExecution([sys.executable])
        root = Path.cwd() / "test-spool"
        process = MagicMock(pid=123)
        with patch.dict(os.environ, {"MOWER_MISSION_SPOOL": str(root)}), \
                patch("jetson_mower_client.autonomy.subprocess.Popen", return_value=process) as spawn:
            self.assertEqual(runner.request_start(True), "autonomy-process-started")
            child = spawn.call_args.kwargs["env"]
            self.assertEqual(child["MOWER_RUN_ID"], runner.run_id)
            self.assertEqual(Path(child["MOWER_PREVIEW_LOG_DIR"]), root / runner.run_id)

    def test_runner_confirmation_reaches_upload_queue(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            process = MagicMock(pid=123)
            process.poll.return_value = None
            runner = AutonomyExecution([sys.executable], lambda event: queue_lifecycle(root, event))
            with patch.dict(os.environ, {"MOWER_MISSION_SPOOL": str(root)}), \
                    patch("jetson_mower_client.autonomy.subprocess.Popen", return_value=process) as spawn:
                self.assertEqual(runner.request_start(True), "autonomy-process-started")
            folder = root / runner.run_id
            with patch.dict(os.environ, spawn.call_args.kwargs["env"]):
                publish_confirmation("end", datetime.now(timezone.utc).isoformat())
                runner.poll_confirmations()
                self.assertFalse(runner.started)
                self.assertFalse((folder / ".lifecycle-end.json").exists())
                end = folder / ".confirmed-end.json"
                end.unlink()
                publish_confirmation("start", datetime.now(timezone.utc).isoformat())
                runner.poll_confirmations()
                self.assertTrue((folder / ".lifecycle-start.json").is_file())
                process.poll.return_value = 0
                runner.poll_confirmations()
                self.assertEqual(runner.state, "end-unconfirmed")
                publish_confirmation("end", datetime.now(timezone.utc).isoformat())
                runner.poll_confirmations()
                self.assertTrue((folder / ".lifecycle-end.json").is_file())
                self.assertEqual(runner.state, "end-confirmed")

    def test_posix_cleanup_keeps_group_after_parent_exit(self):
        runner = AutonomyExecution([sys.executable])
        process = MagicMock(pid=123)
        process.poll.return_value = 0
        with patch("jetson_mower_client.autonomy.os.name", "posix"), \
                patch("jetson_mower_client.autonomy.subprocess.Popen", return_value=process), \
                patch("jetson_mower_client.autonomy.os.killpg", create=True) as kill:
            runner.request_start(True)
            runner.poll()
            runner.stop()
            kill.assert_called_once()
            self.assertEqual(kill.call_args.args[0], 123)

    def test_start_confirmation_requires_live_matching_run_and_aware_timestamp(self):
        runner = AutonomyExecution([sys.executable, str(MOCK)])
        try:
            runner.request_start(True)
            for run_id, stamp in [("other", "2026-11-07T00:00:00Z"), (runner.run_id, "2026-11-07T00:00:00")]:
                with self.assertRaises(ValueError):
                    runner.confirm_started(run_id, stamp)
        finally:
            runner.stop()

    def test_estop_latches_before_process_cleanup_failure(self):
        client = load_client()
        node = client.JetsonMowerClientNode.__new__(client.JetsonMowerClientNode)
        node._manual_challenge = MagicMock()
        node._pending_manual_prepare = None
        node._publish_emergency_stop_outputs = MagicMock()
        node._autonomy = MagicMock()
        node._autonomy_authority = None
        node._autonomy.stop.side_effect = OSError()
        with self.assertRaisesRegex(ValueError, "autonomy-stop-unconfirmed"):
            node._handle_estop({}, "now")
        self.assertTrue(node._emergency_active)
        node._publish_emergency_stop_outputs.assert_called_once()

    def test_mqtt_disconnect_stops_preparing_run_and_requires_new_readiness(self):
        client = load_client()
        node = client.JetsonMowerClientNode.__new__(client.JetsonMowerClientNode)
        node._manual_setup_lock = threading.RLock()
        node._disarm_manual_serial = MagicMock()
        node._autonomy = AutonomyExecution([sys.executable, str(MOCK)])
        node._autonomy_authority = None
        node._autonomy_ready = True
        try:
            self.assertEqual(node._autonomy.request_start(True), "autonomy-process-started")
            child = node._autonomy.process
            node._on_mqtt_disconnect()
            self.assertIsNotNone(child.poll())
            self.assertIsNone(node._autonomy_ready)
            self.assertEqual(node._autonomy.state, "end-unconfirmed")
            self.assertEqual(node._autonomy.request_start(node._autonomy_ready), "autonomy-end-unconfirmed")
            node._disarm_manual_serial.assert_called_once()
        finally:
            node._autonomy.stop()

    def test_real_dummy_process_dedup_and_explicit_lifecycle(self):
        signals = []
        runner = AutonomyExecution([sys.executable, str(MOCK)], signals.append)
        try:
            self.assertEqual(runner.request_start(True), "autonomy-process-started")
            run_id = runner.run_id
            self.assertEqual(signals, [])
            self.assertEqual(runner.request_start(True), "autonomy-already-running")
            runner.confirm_started(run_id, "2026-11-07T00:00:00Z")
            runner.confirm_started(run_id, "2026-11-07T00:00:00Z")
            runner.observe(run_id, "2026-11-07T00:00:01Z")
            runner.stop()
            self.assertEqual([s["kind"] for s in signals], ["start", "state"])
            self.assertEqual(runner.request_start(True), "autonomy-end-unconfirmed")
            runner.confirm_ended(run_id, "2026-11-07T00:00:02Z")
            self.assertEqual([s["kind"] for s in signals], ["start", "state", "end"])
            self.assertEqual(len({s["id"] for s in signals}), 3)
        finally:
            runner.stop()

    def test_exit_does_not_invent_job_completion(self):
        for code in [0, 7]:
            signals = []
            runner = AutonomyExecution([sys.executable, str(MOCK), "--seconds", "0", "--exit-code", str(code)], signals.append)
            try:
                runner.request_start(True)
                runner.process.wait(timeout=5)
                runner.poll()
                self.assertEqual(runner.state, "end-unconfirmed")
                self.assertEqual(signals, [])
            finally:
                runner.stop()

    def test_web_auto_with_idle_manual_serial_waits_for_new_readiness(self):
        client = load_client()
        node = client.JetsonMowerClientNode.__new__(client.JetsonMowerClientNode)
        node._manual_challenge = MagicMock()
        node._pending_manual_prepare = None
        node._autonomy = AutonomyExecution([sys.executable, str(MOCK)])
        node._autonomy_authority = None
        node._autonomy_ready = None
        opener = MagicMock()
        node._manual_serial = ManualSerialSession("/dev/test", opener)
        node._autonomy_status = MagicMock()
        node._emergency_active = False
        node._publish_ack = MagicMock()
        node._publish_status = MagicMock()
        node._config = MagicMock(robot_id="TEST-01")
        command = {"commandId": "cmd-1", "lockVersion": 8,
                   "parameters": {"mode": "autonomous", "command": "untrusted-command"}}
        with patch("jetson_mower_client.autonomy.subprocess.Popen") as spawn, \
                patch.object(client.AutonomyAuthority, "start") as start_authority:
            spawn.return_value.poll.return_value = None
            with self.assertRaisesRegex(ValueError, "autonomy-work-zone-invalid"):
                node._handle_mode(command, "now")
            spawn.assert_not_called()
            command["parameters"].update(workZoneId=2, workZoneVersion=11)
            with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
                "MOWER_MISSION_SPOOL": directory, "MOWER_WORK_ZONE_API_BASE_URL": "https://example.invalid",
                "WORK_ZONE_API_TOKEN": "test-only",
            }):
                node._handle_mode(command, "now")
                start_authority.assert_called_once()
                self.assertEqual(node._autonomy_authority.status(), "pending")
            self.assertEqual(node._publish_ack.call_args.args[2:4], ("accepted", "autonomy-process-started"))
            self.assertEqual(spawn.call_args.args[0][2:6],
                             ("jetson_mower_client.autonomy_zone", "TEST-01", "2", "11"))
            self.assertEqual(spawn.call_args.args[0][-2:], (sys.executable, str(MOCK)))
            self.assertFalse(node._autonomy._start_permitted)
            self.assertIsNone(node._autonomy_status)
            self.assertEqual(node._autonomy_zone, (2, 11))
            opener.assert_not_called()
            command["parameters"].update(workZoneId=3)
            with patch.dict(os.environ, {"MOWER_WORK_ZONE_API_BASE_URL": "https://example.invalid",
                                         "WORK_ZONE_API_TOKEN": "test-only"}):
                node._handle_mode(command, "now")
            self.assertEqual(node._publish_ack.call_args.args[2:4], ("rejected", "autonomy-already-running"))
            self.assertEqual(node._autonomy_zone, (2, 11))
            node._emergency_active = True
            node._handle_mode(command, "now")
            self.assertEqual(node._publish_ack.call_args.args[2:4], ("rejected", "emergency-active"))

    def test_supervision_uses_latest_readiness_before_replying(self):
        client = load_client()
        node = client.JetsonMowerClientNode.__new__(client.JetsonMowerClientNode)
        node._manual_setup_lock = threading.RLock()
        node._emergency_active = False
        node._mqtt = MagicMock()
        node._mqtt.is_connected.return_value = True
        node._autonomy = MagicMock()
        node._autonomy_authority = None
        node._refresh_autonomy_readiness = lambda valid: node._autonomy.set_start_permitted(valid)
        node._poll_autonomy()
        self.assertEqual([call[0] for call in node._autonomy.method_calls],
                         ["set_start_permitted", "poll_confirmations"])

    def test_revoked_or_expired_authority_stops_the_mock_runner_without_restart(self):
        client = load_client()
        for revoked in (True, False):
            with self.subTest(revoked=revoked):
                node = client.JetsonMowerClientNode.__new__(client.JetsonMowerClientNode)
                node._manual_setup_lock = threading.RLock()
                node._emergency_active = False
                node._mqtt = MagicMock()
                node._publish_status = MagicMock()
                node._autonomy = AutonomyExecution([sys.executable, str(MOCK)])
                with patch.object(autonomy_authority, "time") as clock:
                    clock.monotonic.return_value = 10
                    authority = client.AutonomyAuthority("https://example.invalid", "test-only", "TEST-01", "cmd-1", 8)
                    node._autonomy_authority = authority
                    authority._opener = MagicMock()
                    response = authority._opener.open.return_value.__enter__.return_value
                    response.read.return_value = b'{"success":true,"data":{"validForMs":750}}'
                    authority._poll()
                    self.assertEqual(authority.status(), "valid")
                    self.assertEqual(node._autonomy.request_start(True), "autonomy-process-started")
                    child = node._autonomy.process
                    try:
                        if revoked:
                            response.read.return_value = b'{"success":true,"data":{"validForMs":0}}'
                            authority._poll()
                        else:
                            clock.monotonic.return_value = 10.75
                        node._poll_autonomy()
                        self.assertIsNotNone(child.poll())
                        self.assertEqual(node._autonomy.state, "authority-lost")
                        self.assertIsNone(node._autonomy_authority)
                        response.read.return_value = b'{"success":true,"data":{"validForMs":2000}}'
                        authority._poll()
                        self.assertEqual(authority.status(), "lost")
                        node._poll_autonomy()
                        self.assertIsNone(node._autonomy.process)
                    finally:
                        node._autonomy.stop()

    def test_web_runner_exit_before_start_allows_an_explicit_retry(self):
        runner = AutonomyExecution([sys.executable])
        failed, replacement = MagicMock(pid=123), MagicMock(pid=124)
        failed.poll.side_effect = [7]
        replacement.poll.return_value = None
        options = dict(robot_id="TEST-01", work_zone_id=2, work_zone_version=11)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "MOWER_MISSION_SPOOL": directory, "MOWER_WORK_ZONE_API_BASE_URL": "https://example.invalid",
            "WORK_ZONE_API_TOKEN": "test-only",
        }), patch("jetson_mower_client.autonomy.subprocess.Popen", side_effect=[failed, replacement]), \
                patch("jetson_mower_client.autonomy.os.killpg", create=True):
            self.assertEqual(runner.request_start(True, **options), "autonomy-process-started")
            runner.poll_confirmations()
            self.assertEqual(runner.state, "start-failed")
            self.assertIsNone(runner.run_id)
            self.assertFalse(runner.owns_execution)
            failed.stdin.close.assert_called_once()
            failed.stdout.close.assert_called_once()
            self.assertEqual(runner.request_start(True, **options), "autonomy-process-started")
            runner.stop()

    def test_web_runner_sends_start_frame_once_after_readiness(self):
        runner = AutonomyExecution([sys.executable])
        process = MagicMock(pid=123)
        process.poll.return_value = None
        ping = b"MOWER_PING " + b"a" * 32 + b"\n"
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "MOWER_MISSION_SPOOL": directory, "MOWER_WORK_ZONE_API_BASE_URL": "https://example.invalid",
            "WORK_ZONE_API_TOKEN": "test-only",
        }), patch("jetson_mower_client.autonomy.subprocess.Popen", return_value=process), \
                patch("jetson_mower_client.autonomy.select.select", return_value=([process.stdout], [], [])), \
                patch("jetson_mower_client.autonomy.os.read", return_value=ping), \
                patch("jetson_mower_client.autonomy.os.killpg", create=True):
            self.assertEqual(runner.request_start(True, robot_id="TEST-01", work_zone_id=2,
                                                  work_zone_version=11), "autonomy-process-started")
            runner.poll()
            process.stdin.write.assert_not_called()
            runner.poll_confirmations()
            runner.set_start_permitted(True)
            runner.poll_confirmations()
            runner.poll_confirmations()
            self.assertEqual([call.args[0] for call in process.stdin.write.call_args_list],
                             [b"a" * 32 + ending for ending in (b" .\n", b" r\n", b" .\n")])
            runner.stop()
