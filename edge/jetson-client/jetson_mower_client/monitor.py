from __future__ import annotations

import argparse
from datetime import datetime, timezone
import time

import rclpy
from rclpy.executors import ExternalShutdownException
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import NavSatFix

from .config import EdgeConfig, load_config
from .mqtt_edge import MqttEdgeClient
from .telemetry import build_telemetry_payload
from .topics import MowerTopics


class TelemetryMonitorNode(Node):
    def __init__(self, config: EdgeConfig) -> None:
        # 상태 확인은 센서 구독만 수행하며 ROS 제어·로그 publisher를 만들지 않는다.
        super().__init__("mower_telemetry_monitor", enable_rosout=False, start_parameter_services=False)
        self._config = config
        self._topics = MowerTopics(config.robot_id)
        self._latest_fix: NavSatFix | None = None
        self._fix_received_at: float | None = None
        self._mqtt = MqttEdgeClient(config, self._topics, lambda *_: None, self.get_logger().info,
                                    subscribe_commands=False)
        self.create_subscription(NavSatFix, config.ros.fix_topic, self._handle_fix, qos_profile_sensor_data)
        self.create_timer(config.ros.telemetry_publish_period_seconds, self._publish_telemetry)
        self.create_timer(config.ros.status_publish_period_seconds, self._publish_status)

    def _handle_fix(self, message: NavSatFix) -> None:
        self._latest_fix = message
        self._fix_received_at = time.monotonic()

    def _publish_telemetry(self) -> None:
        # 끊긴 동안의 메시지를 쌓아 재연결 시 과거 값을 최신처럼 보내지 않는다.
        if not self._mqtt.is_connected():
            return
        payload = build_telemetry_payload(
            self._config.robot_id, utc_now(), fix=self._latest_fix,
            fix_age_seconds=None if self._fix_received_at is None else time.monotonic() - self._fix_received_at,
        )
        self._mqtt.publish_json(self._topics.telemetry, payload, qos=1)

    def _publish_status(self) -> None:
        if not self._mqtt.is_connected():
            return
        self._mqtt.publish_json(self._topics.status, {
            "robotId": self._config.robot_id,
            "connectionState": "online", "mqttState": "connected", "edgeState": "monitoring",
            "lastSeenAt": utc_now(), "stale": False,
        }, qos=1)

    def start(self) -> None:
        self._mqtt.connect()

    def stop(self) -> None:
        # 종료 시에도 주행 정지 등의 ROS 명령을 대신 발행하지 않는다.
        self._mqtt.disconnect()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> None:
    parser = argparse.ArgumentParser(description="ROS 제어 출력 없는 MQTT 상태 전송")
    parser.add_argument("--config", required=True)
    args, ros_args = parser.parse_known_args()
    config = load_config(args.config)
    rclpy.init(args=ros_args)
    node = None
    try:
        node = TelemetryMonitorNode(config)
        node.start()
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        if node is not None:
            node.stop()
            node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
