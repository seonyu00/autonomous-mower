from __future__ import annotations

import argparse
import subprocess
import time
from uuid import uuid4
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

import rclpy
from geometry_msgs.msg import Twist
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, HistoryPolicy, QoSProfile, ReliabilityPolicy
from sensor_msgs.msg import Imu, NavSatFix
from std_msgs.msg import Bool, Int8

from .command_ack import publish_command_ack
from .autonomy import AutonomyExecution
from .command_mapping import TwistCommand, is_stale_client_command, manual_to_twist, parse_iso_utc
from .config import EdgeConfig, load_config
from .hardware_safety import publish_emergency_stop_outputs
from .manual_serial_bridge import ManualSerialBridge
from .manual_challenge import ChallengeScope, ManualChallenge
from .mqtt_edge import MqttEdgeClient
from .topics import MowerTopics, command_type_from_topic
from .telemetry import build_telemetry_payload


class JetsonMowerClientNode(Node):
    def __init__(self, config: EdgeConfig) -> None:
        super().__init__("jetson_mower_client")
        self._config = config
        self._topics = MowerTopics(config.robot_id)
        self._mqtt = MqttEdgeClient(config, self._topics, self._handle_mqtt_message, self.get_logger().info,
                                    on_disconnect=self._disarm_manual_serial)
        self._emergency_active = False
        self._error_observer_session = str(uuid4())
        self._mode: str | None = None
        self._work_state: str | None = None
        self._latest_fix: NavSatFix | None = None
        self._latest_fix_received_at: float | None = None
        self._latest_imu: Imu | None = None
        self._last_manual_command_monotonic: float | None = None
        self._recent_command_keys: OrderedDict[str, None] = OrderedDict()
        self._autonomy = AutonomyExecution(config.autonomy_command)
        # GPS·주행 준비 확인 어댑터가 연결되기 전에는 실행을 허용하지 않는다.
        self._autonomy_ready: bool | None = None
        self._manual_serial = None
        self._manual_challenge = ManualChallenge()
        self._manual_serial_device = None
        if config.manual_serial_port:
            import serial
            self._manual_serial_device = serial.Serial(
                config.manual_serial_port, 115200, timeout=0, write_timeout=0.2, exclusive=True,
            )
            self._manual_serial = ManualSerialBridge(self._manual_serial_device)

        self._cmd_vel_publisher = self.create_publisher(Twist, config.ros.cmd_vel_topic, _cmd_vel_qos(config))
        self._mower_set_mode_publisher = self.create_publisher(Int8, config.ros.mower_set_mode_topic, 10)
        self._mower_engine_publisher = self.create_publisher(Bool, config.ros.mower_engine_topic, 10)
        self.create_subscription(NavSatFix, config.ros.fix_topic, self._handle_fix, 10)
        self.create_subscription(Imu, config.ros.imu_topic, self._handle_imu, 10)

        self.create_timer(config.ros.telemetry_publish_period_seconds, self._publish_telemetry)
        self.create_timer(config.ros.status_publish_period_seconds, self._publish_status)
        self.create_timer(0.1, self._check_manual_timeout)
        self.create_timer(0.1, self._autonomy.poll)
        if self._manual_serial is not None:
            self.create_timer(0.1, self._tick_manual_serial)

    def start(self) -> None:
        self._mqtt.connect()
        self._publish_status()

    def stop(self) -> None:
        self._publish_zero_twist()
        try:
            self._autonomy.stop()
        finally:
            self._mqtt.disconnect()
            if self._manual_serial_device is not None:
                self._manual_serial_device.close()

    def _handle_fix(self, message: NavSatFix) -> None:
        self._latest_fix = message
        self._latest_fix_received_at = time.monotonic()

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
            if command_type == "manual-challenge":
                self._handle_manual_challenge(command)
            elif command_type == "manual-rearm":
                self._handle_manual_rearm(command, received_at)
            elif command_type == "manual-command":
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

        parameters = _parameters(command)
        token = parameters.get("challenge")
        challenge_age = None
        if token is not None and self._manual_serial is not None:
            challenge_age = self._consume_challenge(command, "movement", 350_000_000)
            if challenge_age is None:
                self._publish_zero_twist()
                self._publish_ack(command, "manual-command", "rejected", "manual-challenge-invalid", received_at)
                return
        elif is_stale_client_command(command.get("clientSentAt"), self._config.ros.manual_timeout_ms):
            self._publish_zero_twist()
            self._publish_ack(command, "manual-command", "rejected", "stale-command", received_at)
            return

        self._stop_autonomy()
        if self._manual_serial is not None:
            input_time = parse_iso_utc(command.get("clientSentAt")) if isinstance(command.get("clientSentAt"), str) else None
            input_age = challenge_age if token is not None else ((datetime.now(timezone.utc) - input_time).total_seconds() if input_time else None)
            if input_age is None or not 0 <= input_age < self._config.ros.manual_timeout_ms / 1000:
                self._manual_serial.disarm()
                self._publish_ack(command, "manual-command", "rejected", "manual-input-time-invalid", received_at)
                return
            try:
                speed = float(parameters.get("speed", 0))
            except (ValueError, TypeError):
                self._manual_serial.disarm()
                self._publish_ack(command, "manual-command", "rejected", "invalid-speed", received_at)
                return
            accepted = self._manual_serial.command(
                str(parameters.get("armId") or ""), str(parameters.get("pressId") or ""),
                str(parameters.get("direction") or "stop"), speed, time.monotonic(), input_age,
            )
            self._publish_ack(command, "manual-command", "accepted" if accepted else "rejected",
                              None if accepted else "manual-not-armed", received_at)
            return
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
        self._manual_challenge.invalidate()
        serial_sent = True
        if self._manual_serial is None:
            self._publish_zero_twist()
        else:
            parameters = _parameters(command)
            self._manual_serial.stop(parameters.get("armId"), parameters.get("pressId"))
            serial_sent = self._tick_manual_serial()
        self._stop_autonomy()
        if not self._emergency_active:
            self._mode = "idle"
            self._work_state = "idle"
        self._last_manual_command_monotonic = None
        self._publish_ack(command, "stop", "accepted" if serial_sent else "rejected",
                          None if serial_sent else "manual-serial-failed", received_at)
        self._publish_status()

    def _handle_estop(self, command: dict[str, Any], received_at: str) -> None:
        self._manual_challenge.invalidate()
        serial_sent = self._publish_emergency_stop_outputs()
        self._emergency_active = True
        self._mode = "emergency"
        self._work_state = "error"
        self._last_manual_command_monotonic = None
        self._stop_autonomy()
        self._publish_ack(command, "emergency-stop", "rejected" if serial_sent is False else "accepted",
                          "manual-serial-failed" if serial_sent is False else None, received_at)
        self._publish_status()

    def _handle_mode(self, command: dict[str, Any], received_at: str) -> None:
        self._manual_challenge.invalidate()
        if self._emergency_active:
            self._publish_ack(command, "change-mode", "rejected", "emergency-active", received_at)
            return
        mode = str(_parameters(command).get("mode", "idle"))
        if mode not in {"idle", "manual", "autonomous", "home"}:
            raise ValueError("invalid-mode")
        if mode == "autonomous":
            if self._manual_serial is not None:
                self._publish_ack(command, "change-mode", "rejected", "manual-serial-active", received_at)
                return
            reason = self._autonomy.request_start(self._autonomy_ready)
            # 프로세스 생성은 실제 주행 시작 확인이나 완료 응답이 아니다.
            self._publish_ack(command, "change-mode", "accepted" if reason == "autonomy-process-started" else "rejected", reason, received_at)
            self._publish_status()
            return
        if self._manual_serial is not None:
            self._manual_serial.disarm()
            self._tick_manual_serial()
        self._stop_autonomy()
        self._mode = mode
        self._work_state = "returning-home" if mode == "home" else "idle"
        self._publish_ack(command, "change-mode", "accepted", None, received_at)
        self._publish_status()

    def _handle_attachment(self, command: dict[str, Any], received_at: str) -> None:
        if self._emergency_active:
            self._publish_ack(command, "mower-attachment", "rejected", "emergency-active", received_at)
            return
        if self._manual_serial is not None:
            self._publish_ack(command, "mower-attachment", "rejected", "attachment-not-connected", received_at)
            return
        action = str(_parameters(command).get("attachmentAction", ""))
        if action not in {"blade-start", "blade-stop", "raise", "lower"}:
            raise ValueError("invalid-attachment-action")
        # TODO: 작업 장치 명령은 이후 별도 ROS 인터페이스로 연결한다.
        self._publish_ack(command, "mower-attachment", "accepted", None, received_at)
        self._publish_status()

    def _stop_autonomy(self) -> None:
        try:
            self._autonomy.stop()
        except (OSError, subprocess.TimeoutExpired) as error:
            self._autonomy.state = "stop-unconfirmed"
            raise ValueError("autonomy-stop-unconfirmed") from error

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
        if self._manual_serial is not None:
            self._manual_serial.disarm()
            self._tick_manual_serial()
            return
        self._publish_twist(TwistCommand())

    def _publish_emergency_stop_outputs(self) -> bool | None:
        if self._manual_serial is not None:
            # 시리얼 전환은 현장 리모컨 경로를 차단하지 않는다.
            self._manual_serial.disarm()
            return self._tick_manual_serial()
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

    def _handle_manual_rearm(self, command: dict[str, Any], received_at: str) -> None:
        # 재전달된 오래된 재개 요청은 새 사용자 의사로 해석하지 않는다.
        sent = command.get("clientSentAt")
        arm_id = command.get("commandId")
        sent_at = parse_iso_utc(sent) if isinstance(sent, str) else None
        age = (datetime.now(timezone.utc) - sent_at).total_seconds() if sent_at is not None else None
        token = _parameters(command).get("challenge")
        valid_time = (self._consume_challenge(command, "rearm", 2_000_000_000) is not None
                      if token is not None else age is not None and 0 <= age <= 2)
        if (self._emergency_active or self._manual_serial is None or not self._mqtt.is_connected()
                or not valid_time
                or not isinstance(arm_id, str) or not arm_id):
            self._publish_ack(command, "manual-rearm", "rejected", "manual-rearm-unavailable", received_at)
            return
        accepted = self._manual_serial.arm(arm_id, time.monotonic())
        self._publish_ack(command, "manual-rearm", "accepted" if accepted else "rejected",
                          None if accepted else "remote-status-unavailable", received_at)
        self._publish_status()

    def _tick_manual_serial(self) -> bool:
        if self._manual_serial is None:
            return False
        if self._manual_serial.failed:
            return False
        if not self._mqtt.is_connected() or self._emergency_active:
            self._manual_serial.disarm()
        try:
            was_armed = self._manual_serial.armed
            self._manual_serial.tick(time.monotonic())
            if self._manual_serial.remote_active:
                self._manual_challenge.invalidate()
            if was_armed and not self._manual_serial.armed and self._mqtt.is_connected():
                self._publish_status()
            return True
        except (OSError, ValueError):
            self.get_logger().error("수동 시리얼 통신 실패: 재개 요청을 차단합니다.")
            if self._mqtt.is_connected():
                self._publish_status()
            return False

    def _disarm_manual_serial(self) -> None:
        self._manual_challenge.invalidate()
        if self._manual_serial is not None:
            self._manual_serial.disarm()

    def _challenge_scope(self, command: dict[str, Any], purpose: str) -> ChallengeScope:
        params = _parameters(command)
        return ChallengeScope(purpose, command.get("robotId"), command.get("requestedBy"), command.get("lockVersion"),
                              params.get("armId"), params.get("pressId"), params.get("direction"), params.get("speed"))

    def _consume_challenge(self, command: dict[str, Any], purpose: str, max_age_ns: int) -> float | None:
        age = self._manual_challenge.consume(_parameters(command).get("challenge"),
                                             self._challenge_scope(command, purpose), time.monotonic_ns(), max_age_ns)
        return None if age is None else age / 1_000_000_000

    def _handle_manual_challenge(self, command: dict[str, Any]) -> None:
        purpose = _parameters(command).get("purpose")
        scope = self._challenge_scope(command, purpose)
        if self._emergency_active or self._manual_serial is None or not self._mqtt.is_connected() or not scope.valid():
            return
        token = self._manual_challenge.issue(scope, time.monotonic_ns())
        self._mqtt.publish_json(self._topics.command_ack, {
            "robotId": self._config.robot_id, "commandId": command.get("commandId"),
            "commandType": "manual-challenge", "challenge": token,
        }, qos=1)

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
        payload = build_telemetry_payload(
            self._config.robot_id,
            utc_now(),
            fix=self._latest_fix,
            fix_age_seconds=None if self._latest_fix_received_at is None
            else time.monotonic() - self._latest_fix_received_at,
            mode=self._mode,
            work_state=self._work_state,
            error_state="emergency-stop-active" if self._emergency_active else None,
            error_observer_session=self._error_observer_session,
        )
        # TODO: 속도, 배터리, 신호 세기는 실제 ROS/Jetson 소스에서 계산한다.
        # TODO: 영상 송출 구현 후 카메라/WebRTC 상태를 추가한다.
        self._mqtt.publish_json(self._topics.telemetry, payload, qos=1)

    def _publish_status(self) -> None:
        self._autonomy.poll()
        serial_state = None if self._manual_serial is None else (
            "manual-serial-ready" if self._manual_serial.armed else "manual-serial-locked")
        payload = {
            "robotId": self._config.robot_id,
            "connectionState": "degraded" if self._emergency_active else "online",
            "mqttState": "connected",
            "edgeState": "emergency" if self._emergency_active else (
                serial_state or ("autonomy-" + self._autonomy.state if self._autonomy.run_id is not None else self._mode or "connected")),
            "lastSeenAt": utc_now(),
            "stale": False,
        }
        self._mqtt.publish_json(self._topics.status, payload, qos=1)


def _parameters(command: dict[str, Any]) -> dict[str, Any]:
    parameters = command.get("parameters")
    return parameters if isinstance(parameters, dict) else {}


def _cmd_vel_qos(config: EdgeConfig) -> QoSProfile:
    durability = {
        "volatile": DurabilityPolicy.VOLATILE,
        "transient_local": DurabilityPolicy.TRANSIENT_LOCAL,
    }[config.ros.cmd_vel_qos_durability]
    reliability = {
        "reliable": ReliabilityPolicy.RELIABLE,
        "best_effort": ReliabilityPolicy.BEST_EFFORT,
    }[config.ros.cmd_vel_qos_reliability]

    return QoSProfile(
        history=HistoryPolicy.KEEP_LAST,
        depth=config.ros.cmd_vel_qos_depth,
        durability=durability,
        reliability=reliability,
    )


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
        # 종료 신호로 ROS가 먼저 종료된 경우에도 정리 중 오류를 내지 않는다.
        rclpy.try_shutdown()


if __name__ == "__main__":
    main()
