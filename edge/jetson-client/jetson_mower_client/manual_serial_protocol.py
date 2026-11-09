"""현장 방향키 시험과 같은 STM32 바퀴 명령 형식."""

import math

MAX_PWM_DELTA = 100


def encode_packet(mode: int, left: int, right: int) -> bytes:
    if mode not in (0, 1) or not all(1500 - MAX_PWM_DELTA <= value <= 1500 + MAX_PWM_DELTA for value in (left, right)):
        raise ValueError("잘못된 모드 또는 바퀴 명령")
    body = f"{mode},{left},{right},0"
    checksum = 0
    for char in body:
        checksum ^= ord(char)
    return f"${body},{checksum:02X}*\n".encode("ascii")


def manual_wheels(direction: str, speed: float) -> tuple[int, int]:
    if not math.isfinite(speed) or not 0 <= speed <= 1:
        raise ValueError("잘못된 속도")
    delta = min(round(speed * 300), MAX_PWM_DELTA)
    directions = {
        "forward": (delta, delta),
        "backward": (-delta, -delta),
        "reverse": (-delta, -delta),
        "left": (delta, -delta),
        "right": (-delta, delta),
        "rotate-left": (delta, -delta),
        "rotate-right": (-delta, delta),
        "stop": (0, 0),
    }
    if direction not in directions:
        raise ValueError("지원하지 않는 방향")
    left, right = directions[direction]
    return 1500 + left, 1500 + right
