from __future__ import annotations

import argparse
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

import rclpy
from geometry_msgs.msg import Twist
from rclpy.node import Node
from sensor_msgs.msg import Imu, NavSatFix
from std_msgs.msg import Bool, Int8

from .command_ack import publish_command_ack
from .command_mapping import TwistCommand, is_stale_client_command, manual_to_twist
from .config import EdgeConfig, load_config
from .hardware_safety import publish_emergency_stop_outputs
from .mqtt_edge import MqttEdgeClient
from .topics import MowerTopics, command_type_from_topic


class JetsonMowerClientNode(Node):
    def __init__(self, config: EdgeConfig) -> None:
        super().__init__("jetson_mower_client")
        self._config = config
        self._topics = MowerTopics(config.robot_id)
        self._mqtt = MqttEdgeClient(config, self._topics, self._handle_mqtt_message, self.get_logger().info)
        self._emergency_active = False
        self._mode = "idle"
        self._work_state = "idle"
        self._latest_fix: NavSatFix | None = None
        self._latest_imu: Imu | None = None
        self._last_manual_command_monotonic: float | None = None
        self._recent_command_keys: OrderedDict[str, None] = OrderedDict()

        self._cmd_vel_publisher = self.create_publisher(Twist, config.ros.cmd_vel_topic, 10)
        self._mower_set_mode_publisher = self.create_publisher(Int8, config.ros.mower_set_mode_topic, 10)
        self._mower_engine_publisher = self.create_publisher(Bool, config.ros.mower_engine_topic, 10)
        self.create_subscription(NavSatFix, config.ros.fix_topic, self._handle_fix, 10)
        self.create_subscription(Imu, config.ros.imu_topic, self._handle_imu, 10)

        self.create_timer(config.ros.telemetry_publish_period_seconds, self._publish_telemetry)
        self.create_timer(config.ros.status_publish_period_seconds, self._publish_status)
        self.create_timer(0.1, self._check_manual_timeout)

    def start(self) -> None:
        self._mqtt.connect()
        self._publish_status()

    def stop(self) -> None:
        self._publish_zero_twist()
        self._mqtt.disconnect()

    def _handle_fix(self, message: NavSatFix) -> None:
        self._latest_fix = message

    def _handle_imu(self, message: Imu) -> None:
        self._latest_imu = message

    def _handle_mqtt_message(self, topic: str, command: dict[str, Any] | None, raw_payload: bytes) -> None:
        received_at = utc_now()
        if command is None:
            self.get_logger().warning(f"invalid mqtt payload topic={topic} bytes={len(raw_payload)}")
            self._publish_ack(None, command_type_from_topic(topic), "rejected", "invalid-json", received_at)
            return

        if command.get("robotId") != self._config.robot_id:
            self._publish_ack(command, command_type_from_topic(topic), "rejected", "robot-id-mismatch", received_at)
            return

        command_type = str(command.get("commandType") or command_type_from_topic(topic))
        if self._is_duplicate_command(command):
            self.get_logger().info(
                f"ignoring duplicate mqtt command commandId={command.get('commandId')} "
                f"idempotencyKey={command.get('idempotencyKey')}"
            )
            return

        try:
            if command_type == "manual-command":
                self._handle_manual(command, received_at)
            elif command_type == "stop":
                self._handle_stop(command, received_at)
            elif command_type == "emergency-stop":
                self._handle_estop(command, received_at)
            elif command_type == "change-mode":
                self._handle_mode(command, received_at)
            elif command_type == "mower-attachment":
                self._handle_attachment(command, received_at)
            else:
                self._publish_ack(command, command_type, "rejected", "unsupported-command-type", received_at)
        except ValueError as error:
            self._publish_ack(command, command_type, "rejected", str(error), received_at)

    def _handle_manual(self, command: dict[str, Any], received_at: str) -> None:
        if self._emergency_active:
            self._publish_ack(command, "manual-command", "rejected", "emergency-active", received_at)
            return

        if is_stale_client_command(command.get("clientSentAt"), self._config.ros.manual_timeout_ms):
            self._publish_zero_twist()
            self._publish_ack(command, "manual-command", "rejected", "stale-command", received_at)
            return

        parameters = _parameters(command)
        twist = manual_to_twist(
            parameters,
            max_linear_mps=self._config.ros.max_linear_mps,
            max_angular_radps=self._config.ros.max_angular_radps,
        )
        self._publish_twist(twist)
        self._last_manual_command_monotonic = time.monotonic()
        self._mode = "manual"
        self._work_state = "mowing" if twist.linear_x != 0.0 or twist.angular_z != 0.0 else "idle"
        self._publish_ack(command, "manual-command", "accepted", None, received_at)

    def _handle_stop(self, command: dict[str, Any], received_at: str) -> None:
        self._publish_zero_twist()
        if not self._emergency_active:
            self._mode = "idle"
            self._work_state = "idle"
        self._last_manual_command_monotonic = None
        self._publish_ack(command, "stop", "accepted", None, received_at)
        self._publish_status()

    def _handle_estop(self, command: dict[str, Any], received_at: str) -> None:
        self._publish_emergency_stop_outputs()
        self._emergency_active = True
        self._mode = "emergency"
        self._work_state = "error"
        self._last_manual_command_monotonic = None
        self._publish_ack(command, "emergency-stop", "accepted", None, received_at)
        self._publish_status()

    def _handle_mode(self, command: dict[str, Any], received_at: str) -> None:
        if self._emergency_active:
            self._publish_ack(command, "change-mode", "rejected", "emergency-active", received_at)
            return
        mode = str(_parameters(command).get("mode", "idle"))
        if mode not in {"idle", "manual", "autonomous", "home"}:
            raise ValueError("invalid-mode")
        self._mode = mode
        self._work_state = "returning-home" if mode == "home" else "idle"
        self._publish_ack(command, "change-mode", "accepted", None, received_at)
        self._publish_status()

    def _handle_attachment(self, command: dict[str, Any], received_at: str) -> None:
        if self._emergency_active:
            self._publish_ack(command, "mower-attachment", "rejected", "emergency-active", received_at)
            return
        action = str(_parameters(command).get("attachmentAction", ""))
        if action not in {"blade-start", "blade-stop", "raise", "lower"}:
            raise ValueError("invalid-attachment-action")
        # TODO: 작업 장치 명령은 이후 별도 ROS 인터페이스로 연결한다.
        self._publish_ack(command, "mower-attachment", "accepted", None, received_at)
        self._publish_status()

    def _check_manual_timeout(self) -> None:
        if self._last_manual_command_monotonic is None:
            return
        elapsed_ms = (time.monotonic() - self._last_manual_command_monotonic) * 1000
        if elapsed_ms > self._config.ros.manual_timeout_ms:
            self._publish_zero_twist()
            self._last_manual_command_monotonic = None
            self._work_state = "idle"
            self.get_logger().warning("manual command timeout; published zero /cmd_vel")

    def _publish_twist(self, command: TwistCommand) -> None:
        message = Twist()
        message.linear.x = command.linear_x
        message.angular.z = command.angular_z
        self._cmd_vel_publisher.publish(message)

    def _publish_zero_twist(self) -> None:
        self._publish_twist(TwistCommand())

    def _publish_emergency_stop_outputs(self) -> None:
        # 하드웨어 브릿지 E-Stop 순서:
        # 1. 주행 속도를 먼저 0으로 만들고, 2. STM32 브릿지 상태 머신을 EMERGENCY로 전환한 뒤,
        # 3. 엔진 릴레이를 강제로 차단한다. 이후 엔진 상태를 자동 복구하면 안 된다.
        publish_emergency_stop_outputs(
            self._cmd_vel_publisher,
            self._mower_set_mode_publisher,
            self._mower_engine_publisher,
            Twist,
            Int8,
            Bool,
        )

    def _publish_ack(
        self,
        command: dict[str, Any] | None,
        command_type: str,
        status: str,
        reason: str | None,
        received_at: str,
    ) -> None:
        publish_command_ack(
            self._mqtt,
            self._topics.command_ack,
            self._config.robot_id,
            self._config.edge_node_id,
            command,
            command_type,
            status,
            reason,
            received_at,
            utc_now,
        )

    def _is_duplicate_command(self, command: dict[str, Any]) -> bool:
        key = command.get("idempotencyKey") or command.get("commandId")
        if not key:
            return False

        cache_key = f"{command.get('robotId')}:{key}"
        if cache_key in self._recent_command_keys:
            return True

        self._recent_command_keys[cache_key] = None
        while len(self._recent_command_keys) > self._config.mqtt.recent_command_cache_size:
            self._recent_command_keys.popitem(last=False)
        return False

    def _publish_telemetry(self) -> None:
        fix = self._latest_fix
        payload = {
            "robotId": self._config.robot_id,
            "latitude": float(fix.latitude) if fix else 0.0,
            "longitude": float(fix.longitude) if fix else 0.0,
            "batteryLevel": self._config.telemetry.default_battery_level,
            "mode": self._mode,
            "workState": self._work_state,
            "speedMps": 0.0,
            "signalStrength": self._config.telemetry.default_signal_strength,
            "receivedAt": utc_now(),
            "errorState": "emergency-stop-active" if self._emergency_active else None,
        }
        # TODO: 속도, 배터리, 신호 세기는 실제 ROS/Jetson 소스에서 계산한다.
        # TODO: 영상 송출 구현 후 카메라/WebRTC 상태를 추가한다.
        self._mqtt.publish_json(self._topics.telemetry, payload, qos=1)

    def _publish_status(self) -> None:
        payload = {
            "robotId": self._config.robot_id,
            "connectionState": "degraded" if self._emergency_active else "online",
            "mqttState": "connected",
            "edgeState": "emergency" if self._emergency_active else self._mode,
            "lastSeenAt": utc_now(),
            "stale": False,
        }
        self._mqtt.publish_json(self._topics.status, payload, qos=1)


def _parameters(command: dict[str, Any]) -> dict[str, Any]:
    parameters = command.get("parameters")
    return parameters if isinstance(parameters, dict) else {}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Jetson mower MQTT/ROS 2 edge client")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)

    rclpy.init()
    node = JetsonMowerClientNode(config)
    try:
        node.start()
        rclpy.spin(node)
    finally:
        node.stop()
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
