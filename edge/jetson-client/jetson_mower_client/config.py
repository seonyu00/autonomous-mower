from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml


@dataclass(frozen=True)
class MqttConfig:
    broker_url: str
    username: str | None
    password: str | None
    client_id: str
    keepalive_seconds: int
    reconnect_delay_seconds: float
    recent_command_cache_size: int

    @property
    def host(self) -> str:
        parsed = urlparse(self.broker_url)
        return parsed.hostname or "localhost"

    @property
    def port(self) -> int:
        parsed = urlparse(self.broker_url)
        if parsed.port:
            return parsed.port
        return 8883 if parsed.scheme == "mqtts" else 1883

    @property
    def use_tls(self) -> bool:
        return urlparse(self.broker_url).scheme == "mqtts"


@dataclass(frozen=True)
class RosConfig:
    cmd_vel_topic: str
    fix_topic: str
    imu_topic: str
    telemetry_publish_period_seconds: float
    status_publish_period_seconds: float
    manual_timeout_ms: int
    max_linear_mps: float
    max_angular_radps: float


@dataclass(frozen=True)
class TelemetryConfig:
    default_battery_level: int
    default_signal_strength: int


@dataclass(frozen=True)
class EdgeConfig:
    robot_id: str
    edge_node_id: str
    mqtt: MqttConfig
    ros: RosConfig
    telemetry: TelemetryConfig


def load_config(path: str | Path) -> EdgeConfig:
    config_path = Path(path)
    with config_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    return EdgeConfig(
        robot_id=str(raw.get("robot_id", "MOWER-01")),
        edge_node_id=str(raw.get("edge_node_id", f"jetson-{raw.get('robot_id', 'MOWER-01')}")),
        mqtt=_mqtt_config(raw.get("mqtt") or {}, raw.get("robot_id", "MOWER-01")),
        ros=_ros_config(raw.get("ros") or {}),
        telemetry=_telemetry_config(raw.get("telemetry") or {}),
    )


def _mqtt_config(raw: dict[str, Any], robot_id: str) -> MqttConfig:
    client_id = raw.get("client_id") or f"jetson-{robot_id}"
    return MqttConfig(
        broker_url=str(raw.get("broker_url", "mqtt://localhost:1883")),
        username=_optional_string(raw.get("username")),
        password=_optional_string(raw.get("password")),
        client_id=str(client_id),
        keepalive_seconds=int(raw.get("keepalive_seconds", 30)),
        reconnect_delay_seconds=float(raw.get("reconnect_delay_seconds", 2)),
        recent_command_cache_size=int(raw.get("recent_command_cache_size", 256)),
    )


def _ros_config(raw: dict[str, Any]) -> RosConfig:
    return RosConfig(
        cmd_vel_topic=str(raw.get("cmd_vel_topic", "/cmd_vel")),
        fix_topic=str(raw.get("fix_topic", "/fix")),
        imu_topic=str(raw.get("imu_topic", "/camera/imu")),
        telemetry_publish_period_seconds=float(raw.get("telemetry_publish_period_seconds", 1.0)),
        status_publish_period_seconds=float(raw.get("status_publish_period_seconds", 3.0)),
        manual_timeout_ms=int(raw.get("manual_timeout_ms", 500)),
        max_linear_mps=float(raw.get("max_linear_mps", 1.0)),
        max_angular_radps=float(raw.get("max_angular_radps", 1.0)),
    )


def _telemetry_config(raw: dict[str, Any]) -> TelemetryConfig:
    return TelemetryConfig(
        default_battery_level=int(raw.get("default_battery_level", 100)),
        default_signal_strength=int(raw.get("default_signal_strength", 100)),
    )


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
