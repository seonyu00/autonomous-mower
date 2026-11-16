"""동시 측정한 두 GPS 위치로 시험용 방향 후보를 계산한다."""

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class AntennaFix:
    measured_at_s: float
    received_monotonic_s: float
    latitude: float
    longitude: float
    quality: int


def heading_enu_rad(
    main: AntennaFix,
    auxiliary: AntennaFix,
    *,
    now_monotonic_s: float,
    baseline_m: float,
    baseline_tolerance_m: float,
    main_to_aux_body_rad: float,
    max_age_s: float,
    max_time_difference_s: float,
) -> float:
    """주→보조 벡터에서 기체 장착각을 빼 동쪽 0·반시계 양수 방향을 얻는다.

    날짜를 포함한 실제 측정 시각과 단조 시계 수신 시각을 호출자가 제공한다.
    이 검사 통과는 방향 정확도나 주행 가능 여부를 보증하지 않는다.
    """
    settings = (now_monotonic_s, baseline_m, baseline_tolerance_m,
                main_to_aux_body_rad, max_age_s, max_time_difference_s)
    if not all(math.isfinite(x) for x in settings):
        raise ValueError("방향 검사 설정이 유효하지 않음")
    if (baseline_m <= 0 or baseline_tolerance_m < 0
            or baseline_tolerance_m >= baseline_m or max_age_s <= 0
            or max_time_difference_s < 0):
        raise ValueError("방향 검사 범위가 유효하지 않음")
    for fix in (main, auxiliary):
        if not all(math.isfinite(x) for x in (
                fix.measured_at_s, fix.received_monotonic_s,
                fix.latitude, fix.longitude)):
            raise ValueError("유효하지 않은 GPS 측정")
        if not -90 < fix.latitude < 90 or not -180 <= fix.longitude <= 180:
            raise ValueError("GPS 좌표 범위 오류")
        if fix.quality != 4:
            raise ValueError("양쪽 RTK Fixed 필요")
        if not 0 <= now_monotonic_s - fix.received_monotonic_s < max_age_s:
            raise ValueError("GPS 수신 만료 또는 미래 수신 시각")
    if abs(main.measured_at_s - auxiliary.measured_at_s) > max_time_difference_s:
        raise ValueError("두 GPS 측정 시각 불일치")
    # 차체 크기의 짧은 기준선에 사용하는 국소 평면 근사다.
    radius_m = 6378137.0
    north = math.radians(auxiliary.latitude - main.latitude) * radius_m
    longitude_delta = (auxiliary.longitude - main.longitude + 180) % 360 - 180
    east = (math.radians(longitude_delta) * radius_m
            * math.cos(math.radians((main.latitude + auxiliary.latitude) / 2)))
    if abs(math.hypot(east, north) - baseline_m) > baseline_tolerance_m:
        raise ValueError("실측 안테나 간격과 불일치")
    angle = math.atan2(north, east) - main_to_aux_body_rad
    return math.atan2(math.sin(angle), math.cos(angle))
