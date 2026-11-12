"""웹 수동 입력을 시리얼 출력에 연결하기 전의 중재 상태."""

import re
from dataclasses import dataclass, field

from .manual_serial_protocol import encode_packet, manual_wheels


_REMOTE_STATUS = re.compile(r"^Remote active:\s*([01])\s*\(hold remaining=(\d+)ms\)$")
_STATUS_TIMEOUT = 2.5
# 100ms 출력 주기에서 500ms 데드맨 한계를 넘지 않도록 여유를 둔다.
_INPUT_TIMEOUT = 0.35
_REMOTE_PACKET = encode_packet(0, 1500, 1500)


@dataclass
class ManualSerialState:
    armed: bool = False
    lock_reason: str = "not-armed"
    remote_active: bool = True
    remote_seen_at: float | None = None
    input_at: float | None = None
    wheels: tuple[int, int] = (1500, 1500)
    arm_id: str | None = None
    press_id: str | None = None
    retired_presses: set[str] = field(default_factory=set)
    seen_arms: set[str] = field(default_factory=set)

    def observe(self, line: str, now: float) -> bool:
        match = _REMOTE_STATUS.fullmatch(line.strip())
        if match is None:
            return False
        self.remote_seen_at = now
        self.remote_active = match.group(1) == "1" or int(match.group(2)) > 0
        if self.remote_active:
            self.disarm("remote-active")
        return True

    def arm(self, arm_id: str, now: float) -> bool:
        if not arm_id or arm_id in self.seen_arms or len(self.seen_arms) >= 1024:
            return False
        self.seen_arms.add(arm_id)
        if self.remote_active or not self._status_fresh(now):
            return False
        self.armed = True
        self.lock_reason = ""
        self.arm_id = arm_id
        self.press_id = None
        self.retired_presses.clear()
        self.input_at = None
        self.wheels = (1500, 1500)
        return True

    def disarm(self, reason: str | None = None) -> None:
        if reason is not None:
            self.lock_reason = reason
        elif self.armed:
            self.lock_reason = "state-reset"
        self.armed = False
        self.arm_id = None
        self.press_id = None
        self.retired_presses.clear()
        self.input_at = None
        self.wheels = (1500, 1500)

    def command(self, arm_id: str, press_id: str, direction: str, speed: float, now: float, input_age: float = 0) -> bool:
        if not self.armed or self.remote_active or not self._status_fresh(now):
            self.disarm("remote-active" if self.remote_active else "serial-status-timeout" if self.armed else None)
            return False
        if not 0 <= input_age < _INPUT_TIMEOUT:
            self.disarm("input-expired")
            return False
        if arm_id != self.arm_id or not press_id or press_id in self.retired_presses:
            return False
        if self.press_id is not None and self.press_id != press_id:
            return False
        try:
            wheels = manual_wheels(direction, speed)
        except (TypeError, ValueError):
            self.disarm("invalid-speed")
            return False
        self.press_id = press_id
        self.wheels = wheels
        self.input_at = now - input_age if self.wheels != (1500, 1500) else None
        return True

    def stop(self, arm_id: str | None, press_id: str | None) -> None:
        if arm_id != self.arm_id or not press_id:
            self.disarm("stop-requested")
            return
        # 완료된 누름을 기억해 지연된 반복 명령으로 다시 출발하지 않게 한다.
        self.retired_presses.add(press_id)
        if len(self.retired_presses) > 1024:
            self.disarm()
        elif self.press_id == press_id:
            self.press_id = None
            self.input_at = None
            self.wheels = (1500, 1500)

    def packet(self, now: float) -> bytes:
        if not self._status_fresh(now):
            self.disarm("serial-status-timeout" if self.armed else None)
        if self.remote_active or not self.armed or self.input_at is None:
            return _REMOTE_PACKET
        if now - self.input_at >= _INPUT_TIMEOUT:
            self.disarm("input-timeout")
            return _REMOTE_PACKET
        return encode_packet(1, *self.wheels)

    def _status_fresh(self, now: float) -> bool:
        return self.remote_seen_at is not None and 0 <= now - self.remote_seen_at < _STATUS_TIMEOUT
