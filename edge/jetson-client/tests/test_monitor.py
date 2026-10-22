import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from jetson_mower_client.config import MqttConfig
from jetson_mower_client.mqtt_edge import MqttEdgeClient
from jetson_mower_client.topics import MowerTopics


class SensorOnlyNode:
    def __init__(self, name, **kwargs):
        self.options = kwargs
        self.subscriptions = []
        self.timers = []

    def get_logger(self):
        return MagicMock()

    def create_subscription(self, *args):
        self.subscriptions.append(args)

    def create_timer(self, *args):
        self.timers.append(args)

    def create_publisher(self, *args):
        raise AssertionError("상태 전용 노드는 ROS publisher를 만들면 안 된다")


def load_monitor():
    modules = {name: ModuleType(name) for name in ["rclpy", "rclpy.node", "rclpy.qos", "rclpy.executors", "sensor_msgs", "sensor_msgs.msg"]}
    modules["rclpy.node"].Node = SensorOnlyNode
    modules["rclpy.qos"].qos_profile_sensor_data = object()
    modules["rclpy.executors"].ExternalShutdownException = type("ExternalShutdownException", (Exception,), {})
    modules["sensor_msgs.msg"].NavSatFix = object
    path = Path(__file__).resolve().parents[1] / "jetson_mower_client/monitor.py"
    spec = importlib.util.spec_from_file_location("jetson_mower_client.monitor", path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module


class MonitorTest(unittest.TestCase):
    def setUp(self):
        self.monitor = load_monitor()
        self.config = SimpleNamespace(robot_id="test", ros=SimpleNamespace(
            fix_topic="/fix", telemetry_publish_period_seconds=1, status_publish_period_seconds=3))
        self.mqtt = MagicMock()
        self.mqtt.is_connected.return_value = True
        with patch.object(self.monitor, "MqttEdgeClient", return_value=self.mqtt) as constructor:
            self.node = self.monitor.TelemetryMonitorNode(self.config)
            self.assertFalse(constructor.call_args.kwargs["subscribe_commands"])

    def test_only_sensor_subscription_without_control_publishers_or_parameter_services(self):
        self.assertEqual(self.node.options, {"enable_rosout": False, "start_parameter_services": False})
        self.assertEqual(len(self.node.subscriptions), 1)
        self.assertEqual(self.node.subscriptions[0][1], "/fix")

    def test_missing_sensors_publish_null_and_monitoring_status(self):
        self.node._publish_telemetry()
        payload = self.mqtt.publish_json.call_args.args[1]
        self.assertTrue(all(payload[key] is None for key in (
            "latitude", "longitude", "batteryLevel", "speedMps", "signalStrength", "mode", "workState")))
        self.node._publish_status()
        self.assertEqual(self.mqtt.publish_json.call_args.args[1]["edgeState"], "monitoring")

    def test_gps_receives_independently_and_disconnected_ticks_do_not_queue(self):
        fix = SimpleNamespace(status=SimpleNamespace(status=0), latitude=37.5, longitude=127.0)
        self.node._handle_fix(fix)
        self.node._publish_telemetry()
        self.assertEqual(self.mqtt.publish_json.call_args.args[1]["latitude"], 37.5)
        self.mqtt.publish_json.reset_mock()
        self.mqtt.is_connected.return_value = False
        self.node._publish_telemetry()
        self.node._publish_status()
        self.mqtt.publish_json.assert_not_called()

    def test_stop_only_disconnects_mqtt(self):
        self.node.stop()
        self.mqtt.disconnect.assert_called_once()
        self.mqtt.publish_json.assert_not_called()

    def test_service_shutdown_is_successful_and_disconnects_without_control_output(self):
        node = MagicMock()
        with patch.object(sys, "argv", ["monitor", "--config", "test.yaml"]), \
                patch.object(self.monitor, "load_config", return_value=self.config), \
                patch.object(self.monitor, "TelemetryMonitorNode", return_value=node), \
                patch.object(self.monitor.rclpy, "init", create=True), \
                patch.object(self.monitor.rclpy, "spin", create=True, side_effect=self.monitor.ExternalShutdownException()), \
                patch.object(self.monitor.rclpy, "ok", create=True, return_value=False):
            self.monitor.main()
        node.stop.assert_called_once()
        node.destroy_node.assert_called_once()


class MqttSubscriptionTest(unittest.TestCase):
    def test_monitor_cannot_subscribe_or_dispatch_commands_while_default_still_subscribes(self):
        config = SimpleNamespace(mqtt=MqttConfig("mqtt://localhost:1883", None, None, "test", 30, 2, 256))
        for enabled in [False, True]:
            handler = MagicMock()
            with patch("jetson_mower_client.mqtt_edge.mqtt.Client") as factory:
                edge = MqttEdgeClient(config, MowerTopics("test"), handler, lambda _: None,
                                      subscribe_commands=enabled)
            client = factory.return_value
            edge._handle_connect(client, None, {}, 0)
            edge._handle_message(client, None, SimpleNamespace(topic="mowers/test/commands/stop", payload=b"{}"))
            self.assertEqual(client.subscribe.call_count, 5 if enabled else 0)
            self.assertEqual(handler.call_count, 1 if enabled else 0)


if __name__ == "__main__":
    unittest.main()
