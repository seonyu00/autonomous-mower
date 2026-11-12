"""실장비에 연결하기 전에 별도로 시험하는 수동 시리얼 어댑터."""

from threading import Lock

from .manual_serial_state import ManualSerialState


class ManualSerialBridge:
    def __init__(self, serial_port):
        self._serial = serial_port
        self._state = ManualSerialState()
        self._buffer = bytearray()
        self._lock = Lock()
        self._failed = False
        self._last_tick = None

    def arm(self, arm_id: str, now: float) -> bool:
        with self._lock:
            return not self._failed and self._state.arm(arm_id, now)

    def ready_to_arm(self, now: float) -> bool:
        with self._lock:
            return (not self._failed and not self._state.remote_active
                    and self._state._status_fresh(now))

    @property
    def failed(self) -> bool:
        with self._lock:
            return self._failed

    @property
    def lock_reason(self) -> str:
        with self._lock:
            return "serial-error" if self._failed else self._state.lock_reason

    @property
    def armed(self) -> bool:
        with self._lock:
            return self._state.armed and not self._failed

    @property
    def remote_active(self) -> bool:
        with self._lock:
            return self._state.remote_active or self._failed

    def command(self, arm_id: str, press_id: str, direction: str, speed: float, now: float, input_age: float = 0) -> bool:
        with self._lock:
            return not self._failed and self._state.command(arm_id, press_id, direction, speed, now, input_age)

    def stop(self, arm_id: str | None, press_id: str | None) -> None:
        with self._lock:
            self._state.stop(arm_id, press_id)

    def disarm(self) -> None:
        with self._lock:
            self._state.disarm()

    def tick(self, now: float) -> None:
        with self._lock:
            if self._failed:
                return
            try:
                if self._last_tick is None or now - self._last_tick >= 2.5 or now < self._last_tick:
                    self._state.disarm("initializing" if self._last_tick is None else "serial-loop-delayed")
                    self._state.remote_seen_at = None
                    self._buffer.clear()
                    self._serial.reset_input_buffer()
                self._last_tick = now
                if self._serial.in_waiting > 4096:
                    self._state.disarm("serial-backlog")
                    self._state.remote_seen_at = None
                    self._buffer.clear()
                    self._serial.reset_input_buffer()
                data = self._serial.read(min(self._serial.in_waiting, 4096))
                self._buffer.extend(data)
                if len(self._buffer) > 4096:
                    self._buffer.clear()
                    self._state.disarm("serial-invalid")
                lines = []
                while b"\n" in self._buffer:
                    line, _, remainder = self._buffer.partition(b"\n")
                    self._buffer = bytearray(remainder)
                    lines.append(line.decode("ascii", errors="replace"))
                if sum(line.startswith("Remote active:") for line in lines) > 1:
                    # 쌓인 과거 진단을 현재 장비 상태로 해석하지 않는다.
                    self._state.disarm("serial-backlog")
                    self._state.remote_seen_at = None
                else:
                    for line in lines:
                        self._state.observe(line, now)
                packet = self._state.packet(now)
                if self._serial.write(packet) != len(packet):
                    raise OSError("시리얼 패킷 일부만 전송됨")
            except (OSError, ValueError):
                self._state.disarm()
                self._failed = True
                raise
