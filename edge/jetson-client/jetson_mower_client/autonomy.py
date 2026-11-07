from __future__ import annotations

import os
import signal
import subprocess
import threading
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from uuid import uuid4


class AutonomyExecution:
    """프로세스 실행과 실제 작업 확인을 구분한다. 실제 상태 확인 어댑터는 장비 계약 후 연결한다."""

    def __init__(self, command: Sequence[str] = (), on_signal: Callable[[dict], None] | None = None):
        self.command = tuple(command)
        self.on_signal = on_signal or (lambda value: None)
        self.process = None
        self.state = "not-configured" if not command else "idle"
        self.run_id = None
        self.started = False
        self._last_at = None
        self._process_group = None
        self._lock = threading.RLock()

    def request_start(self, ready: bool | None) -> str:
        with self._lock:
            self.poll()
            if self.process is not None:
                return "autonomy-already-running"
            if self.run_id is not None:
                return "autonomy-end-unconfirmed"
            if not self.command:
                return "autonomy-not-configured"
            if ready is not True:
                self.state = "not-ready" if ready is False else "readiness-unknown"
                return "autonomy-not-ready" if ready is False else "autonomy-readiness-unknown"
            try:
                self.stop()
            except (OSError, subprocess.TimeoutExpired):
                self.state = "stop-unconfirmed"
                return "autonomy-stop-unconfirmed"
            try:
                self.process = subprocess.Popen(
                    self.command, shell=False, stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    start_new_session=os.name == "posix",
                )
            except OSError:
                self.state = "launch-failed"
                return "autonomy-launch-failed"
            self.run_id = str(uuid4())
            self._process_group = self.process.pid if os.name == "posix" else None
            self._last_at = None
            self.state = "awaiting-start"
            return "autonomy-process-started"

    def confirm_started(self, run_id: str, at: str) -> None:
        with self._lock:
            self.poll()
            if self.process is None or run_id != self.run_id:
                raise ValueError("실행 중인 작업을 확인할 수 없습니다.")
            if not self.started:
                self._emit("start", at)
                self.started = True
                self.state = "running"

    def observe(self, run_id: str, at: str) -> None:
        with self._lock:
            if run_id != self.run_id or not self.started or self.process is None:
                raise ValueError("시작이 확인된 실행이 아닙니다.")
            self.poll()
            if self.process is None:
                raise ValueError("프로세스 종료 후 상태를 연장할 수 없습니다.")
            self._emit("state", at)

    def confirm_ended(self, run_id: str, at: str) -> None:
        with self._lock:
            if run_id != self.run_id or not self.started:
                raise ValueError("시작이 확인된 작업이 아닙니다.")
            self._emit("end", at)
            self.started = False
            self.run_id = None
            self.state = "end-confirmed"

    def poll(self) -> None:
        with self._lock:
            if self.process is not None and self.process.poll() is not None:
                self.process = None
                # 정상 exit도 실제 작업 완료의 증거로 사용하지 않는다.
                self.state = "end-unconfirmed" if self.run_id is not None else "end-confirmed"

    def stop(self) -> None:
        with self._lock:
            if self.process is not None or self._process_group is not None:
                try:
                    if os.name == "posix":
                        os.killpg(self._process_group, signal.SIGTERM)
                    else:
                        self.process.terminate()
                    if self.process is not None:
                        self.process.wait(timeout=2)
                except ProcessLookupError:
                    pass
                except subprocess.TimeoutExpired:
                    if os.name == "posix":
                        os.killpg(self._process_group, signal.SIGKILL)
                    else:
                        self.process.kill()
                    self.process.wait(timeout=2)
                self.process = None
                self._process_group = None
                self.state = "end-unconfirmed"

    def _emit(self, kind: str, at: str) -> None:
        # 실제 신호 수신 경로가 확인되기 전에는 네트워크로 작업 이력을 발행하지 않는다.
        stamp = datetime.fromisoformat(at.replace("Z", "+00:00"))
        if stamp.tzinfo is None or (self._last_at is not None and stamp < self._last_at):
            raise ValueError("작업 신호에는 시간 순서가 유효한 UTC 기준 시각이 필요합니다.")
        self.on_signal({"id": str(uuid4()), "runId": self.run_id, "kind": kind, "signalAt": at})
        self._last_at = stamp.astimezone(timezone.utc)
