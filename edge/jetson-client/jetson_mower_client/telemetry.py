from __future__ import annotations

import math
from typing import Any


def build_telemetry_payload(
    robot_id: str,
    received_at: str,
    *,
    fix: Any = None,
    fix_age_seconds: float | None = None,
    mode: str | None = None,
    work_state: str | None = None,
    error_state: str | None = None,
) -> dict[str, Any]:
    latitude = longitude = None
    if (fix is not None and fix_age_seconds is not None
            and 0 <= fix_age_seconds < 3.0 and fix.status.status >= 0):
        if (math.isfinite(fix.latitude) and math.isfinite(fix.longitude)
                and -90 <= fix.latitude <= 90 and -180 <= fix.longitude <= 180):
            latitude, longitude = float(fix.latitude), float(fix.longitude)

    return {
        "robotId": robot_id,
        "latitude": latitude,
        "longitude": longitude,
        # 아직 실제 입력원이 없는 값은 설정 기본값이나 0으로 대체하지 않는다.
        "batteryLevel": None,
        "mode": mode,
        "workState": work_state,
        "speedMps": None,
        "signalStrength": None,
        "receivedAt": received_at,
        "errorState": error_state,
    }
