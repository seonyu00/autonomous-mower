"""명시적인 웹 준비 요청이 있을 때만 시리얼 제어부를 연다."""

import os
import subprocess
import threading
import time

from .manual_serial_bridge import ManualSerialBridge


def open_manual_port(path: str):
    # flock을 사용하지 않는 현장 시험 프로그램도 포트를 점유할 수 있다.
    check = subprocess.run(["fuser", path], capture_output=True, timeout=2, check=False)
    if check.returncode != 1:
        raise OSError("manual-port-busy-or-unverified")
    import serial
    import fcntl
    import termios
    port = serial.Serial(path, 115200, timeout=0, write_timeout=0.2, exclusive=True)
    try:
        fcntl.ioctl(port.fileno(), termios.TIOCEXCL)
        owners = subprocess.run(["fuser", path], capture_output=True, timeout=2, check=False)
        if owners.returncode != 0 or set(owners.stdout.split()) != {str(os.getpid()).encode()}:
            raise OSError("manual-port-busy-or-unverified")
        return port
    except BaseException:
        port.close()
        raise


class ManualSerialSession:
    def __init__(self, path: str, opener=open_manual_port):
        self._path = path
        self._opener = opener
        self._lock = threading.RLock()
        self._port = None
        self._bridge = None
        self.phase = "closed"
        self._deadline = None
        self._lock_reason = "not-armed"

    def prepare(self, now: float) -> None:
        with self._lock:
            self.disarm()
            self._port = self._opener(self._path)
            self._bridge = ManualSerialBridge(self._port)
            self.phase = "preparing"
            self._deadline = now + 30

    @property
    def failed(self) -> bool:
        with self._lock:
            return self._bridge is not None and self._bridge.failed

    @property
    def lock_reason(self):
        with self._lock:
            return self._bridge.lock_reason if self._bridge is not None else self._lock_reason

    @property
    def has_port(self) -> bool:
        with self._lock:
            return self._port is not None

    @property
    def armed(self) -> bool:
        with self._lock:
            return self._bridge is not None and self._bridge.armed

    @property
    def remote_active(self) -> bool:
        with self._lock:
            return self._bridge is None or self._bridge.remote_active

    def ready_to_arm(self, now: float) -> bool:
        with self._lock:
            return self.phase == "ready" and self._bridge is not None and self._bridge.ready_to_arm(now)

    def arm(self, arm_id: str, now: float) -> bool:
        with self._lock:
            if not self.ready_to_arm(now) or self._deadline is None or now >= self._deadline:
                return False
            if not self._bridge.arm(arm_id, now):
                return False
            self.phase = "active"
            self._deadline = None
            return True

    def command(self, arm_id, press_id, direction, speed, now, input_age=0):
        with self._lock:
            return self.phase == "active" and self._bridge.command(arm_id, press_id, direction, speed, now, input_age)

    def stop(self, arm_id, press_id):
        with self._lock:
            if self.phase == "active" and self._bridge is not None:
                self._bridge.stop(arm_id, press_id)
            else:
                self.disarm()

    def disarm(self):
        with self._lock:
            try:
                if self._bridge is not None:
                    self._bridge.disarm()
                    self._lock_reason = self._bridge.lock_reason
                    self._bridge.tick(time.monotonic())
            finally:
                if self._port is not None:
                    self._port.close()
                self._port = self._bridge = None
                self._deadline = None
                self.phase = "closed"

    def tick(self, now: float):
        with self._lock:
            if self._bridge is None:
                return
            try:
                self._bridge.tick(now)
                if self._deadline is not None and now >= self._deadline:
                    self.disarm()
                    self.phase = "timed-out"
                elif self.phase == "preparing" and self._bridge.ready_to_arm(now):
                    self.phase = "ready"
                    self._deadline = now + 2
                elif self.phase == "active" and not self._bridge.armed:
                    self.disarm()
            except (OSError, ValueError):
                self.disarm()
                self.phase = "failed"
                raise
