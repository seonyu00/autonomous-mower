"""실차 준비 입력의 신선도와 구역 일치를 판정한다. 장치를 제어하지 않는다."""

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class Observation:
    value: object
    received_at: float


def readiness(*, now: float, expected_zone: tuple[int, int], actual_zone: tuple[int, int] | None,
              remote: Observation | None, feedback: Observation | None,
              pose: Observation | None, obstacles: Observation | None,
              authority_available: bool, max_age: float) -> str | None:
    """미확인 항목의 사유를 반환한다. 시각은 같은 단조 시계에서 측정해야 한다."""
    if not math.isfinite(now) or not math.isfinite(max_age) or max_age <= 0:
        return "invalid-clock"
    if authority_available is not True:
        return "authority-unavailable"
    if (not isinstance(expected_zone, tuple) or len(expected_zone) != 2
            or any(type(value) is not int or value <= 0 for value in expected_zone)
            or actual_zone != expected_zone):
        return "work-zone-mismatch"

    def fresh(observation):
        return (observation is not None and math.isfinite(observation.received_at)
                and 0 <= now - observation.received_at <= max_age)

    if not fresh(remote) or remote.value is not False:
        return "remote-override-or-stale"
    if not fresh(feedback) or not isinstance(feedback.value, dict):
        return "stm32-feedback-stale"
    data = feedback.value
    if data.get("report_fresh") is not True or data.get("override") is not False or data.get("reason") != "clear":
        return "stm32-feedback-not-clear"
    if not fresh(pose) or not isinstance(pose.value, dict):
        return "pose-stale"
    if pose.value.get("valid") is not True or pose.value.get("yaw_ready") is not True:
        return "pose-unavailable"
    if not fresh(obstacles) or not isinstance(obstacles.value, dict):
        return "obstacles-stale"
    if obstacles.value.get("observation_fresh") is not True or obstacles.value.get("pose_valid") is not True:
        return "obstacles-unavailable"
    return None
