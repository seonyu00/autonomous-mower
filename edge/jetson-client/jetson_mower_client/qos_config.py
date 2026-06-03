from __future__ import annotations


VALID_DURABILITY_VALUES = {"volatile", "transient_local"}
VALID_RELIABILITY_VALUES = {"reliable", "best_effort"}


def normalize_durability(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in VALID_DURABILITY_VALUES:
        raise ValueError(f"지원하지 않는 durability 값입니다: {value}")
    return normalized


def normalize_reliability(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in VALID_RELIABILITY_VALUES:
        raise ValueError(f"지원하지 않는 reliability 값입니다: {value}")
    return normalized

