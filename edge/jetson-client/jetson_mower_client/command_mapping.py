from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Any


ZERO_TWIST = {
    "linear": {"x": 0.0, "y": 0.0, "z": 0.0},
    "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
}


@dataclass(frozen=True)
class TwistCommand:
    linear_x: float = 0.0
    angular_z: float = 0.0

    def as_dict(self) -> dict[str, dict[str, float]]:
        return {
            "linear": {"x": self.linear_x, "y": 0.0, "z": 0.0},
            "angular": {"x": 0.0, "y": 0.0, "z": self.angular_z},
        }


def manual_to_twist(parameters: dict[str, Any], max_linear_mps: float, max_angular_radps: float) -> TwistCommand:
    direction = str(parameters.get("direction", "stop")).lower()
    speed = clamp_float(parameters.get("speed", 0.0), 0.0, 1.0)

    if direction == "forward":
        return TwistCommand(linear_x=speed * max_linear_mps)
    if direction in {"backward", "reverse"}:
        return TwistCommand(linear_x=-speed * max_linear_mps)
    if direction == "left":
        return TwistCommand(angular_z=speed * max_angular_radps)
    if direction == "right":
        return TwistCommand(angular_z=-speed * max_angular_radps)
    if direction == "rotate-left":
        return TwistCommand(angular_z=speed * max_angular_radps)
    if direction == "rotate-right":
        return TwistCommand(angular_z=-speed * max_angular_radps)
    if direction == "stop":
        return TwistCommand()

    raise ValueError(f"unsupported direction: {direction}")


def is_stale_client_command(client_sent_at: str | None, max_age_ms: int, now: datetime | None = None) -> bool:
    if not client_sent_at:
        return False

    parsed = parse_iso_utc(client_sent_at)
    if parsed is None:
        return True

    current = now or datetime.now(timezone.utc)
    age_ms = (current - parsed).total_seconds() * 1000
    return age_ms > max_age_ms


def parse_iso_utc(value: str) -> datetime | None:
    try:
        normalized = value.replace("Z", "+00:00")
        normalized = re.sub(r"(\.\d{6})\d+(?=[+-]\d{2}:\d{2}$)", r"\1", normalized)
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def clamp_float(value: Any, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return minimum
    return max(minimum, min(maximum, number))
