import importlib.util
import sys
from pathlib import Path
from types import ModuleType
import unittest
from unittest.mock import MagicMock, patch

from jetson_mower_client.autonomy import AutonomyExecution
from jetson_mower_client.config import _autonomy_command

MOCK = Path(__file__).parent / "fixtures/autonomy_mock.py"


def load_client():
    names = ["rclpy", "rclpy.node", "rclpy.qos", "geometry_msgs", "geometry_msgs.msg",
             "sensor_msgs", "sensor_msgs.msg", "std_msgs", "std_msgs.msg"]
    modules = {name: ModuleType(name) for name in names}
    modules["rclpy.node"].Node = object
    for name in ("DurabilityPolicy", "HistoryPolicy", "QoSProfile", "ReliabilityPolicy"):
        setattr(modules["rclpy.qos"], name, MagicMock())
    for module, types in [("geometry_msgs.msg", ["Twist"]), ("sensor_msgs.msg", ["Imu", "NavSatFix"]), ("std_msgs.msg", ["Bool", "Int8"])]:
        for name in types:
            setattr(modules[module], name, object)
    path = Path(__file__).parents[1] / "jetson_mower_client/main.py"
    spec = importlib.util.spec_from_file_location("jetson_mower_client.main", path)
    client = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(client)
    return client


class AutonomyTest(unittest.TestCase):
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
        node._publish_emergency_stop_outputs = MagicMock()
        node._autonomy = MagicMock()
        node._autonomy.stop.side_effect = OSError()
        with self.assertRaisesRegex(ValueError, "autonomy-stop-unconfirmed"):
            node._handle_estop({}, "now")
        self.assertTrue(node._emergency_active)
        node._publish_emergency_stop_outputs.assert_called_once()

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

    def test_mode_handler_uses_existing_command_and_never_accepts_missing_readiness(self):
        client = load_client()
        node = client.JetsonMowerClientNode.__new__(client.JetsonMowerClientNode)
        node._autonomy = AutonomyExecution([sys.executable, str(MOCK)])
        node._autonomy_ready = None
        node._emergency_active = False
        node._publish_ack = MagicMock()
        node._publish_status = MagicMock()
        command = {"parameters": {"mode": "autonomous", "command": "untrusted-command"}}
        node._handle_mode(command, "now")
        self.assertEqual(node._publish_ack.call_args.args[2:4], ("rejected", "autonomy-readiness-unknown"))
        node._autonomy_ready = True
        try:
            node._handle_mode(command, "now")
            self.assertEqual(node._publish_ack.call_args.args[2:4], ("accepted", "autonomy-process-started"))
            node._emergency_active = True
            node._handle_mode(command, "now")
            self.assertEqual(node._publish_ack.call_args.args[2:4], ("rejected", "emergency-active"))
        finally:
            node._autonomy.stop()
