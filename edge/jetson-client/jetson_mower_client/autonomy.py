from __future__ import annotations

import os
import json
import signal
import select
import subprocess
import sys
import threading
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from pathlib import Path
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
        self._confirmation_dir: Path | None = None
        self._launched_at: datetime | None = None
        self._lock = threading.RLock()
        self._stdout_buffer = b""
        self._start_permitted = False
        self._start_sent = False
        self._supervision_enabled = False
        self._web_supervised = False

    @property
    def owns_execution(self) -> bool:
        with self._lock:
            return self.process is not None or self._process_group is not None

    def request_start(self, ready: bool | None, *, robot_id: str | None = None,
                      work_zone_id: int | None = None, work_zone_version: int | None = None) -> str:
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
            if robot_id is not None and (
                type(work_zone_id) is not int or work_zone_id <= 0
                or type(work_zone_version) is not int or work_zone_version <= 0
            ):
                return "autonomy-work-zone-invalid"
            run_id = str(uuid4())
            environment = os.environ.copy()
            command = self.command
            spool = environment.get("MOWER_MISSION_SPOOL")
            confirmation_dir = None
            if spool:
                root = Path(spool)
                if not root.is_absolute():
                    self.state = "not-configured"
                    return "autonomy-mission-spool-invalid"
                confirmation_dir = root / run_id
                environment["MOWER_PREVIEW_LOG_DIR"] = str(confirmation_dir)
                environment["MOWER_RUN_ID"] = run_id
            if robot_id is not None:
                if not spool or not environment.get("MOWER_WORK_ZONE_API_BASE_URL") or not environment.get("WORK_ZONE_API_TOKEN"):
                    return "autonomy-work-zone-not-configured"
                # HTTPS 조회를 자식에서 수행해 MQTT의 정지 처리 경로를 막지 않는다.
                command = (sys.executable, "-m", "jetson_mower_client.autonomy_zone",
                           robot_id, str(work_zone_id), str(work_zone_version), *self.command)
            try:
                self.stop()
            except (OSError, subprocess.TimeoutExpired):
                self.state = "stop-unconfirmed"
                return "autonomy-stop-unconfirmed"
            try:
                launched_at = datetime.now(timezone.utc)
                self.process = subprocess.Popen(
                    command, shell=False, stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    start_new_session=os.name == "posix", env=environment,
                )
            except OSError:
                self.state = "launch-failed"
                return "autonomy-launch-failed"
            self.run_id = run_id
            self._confirmation_dir = confirmation_dir
            self._launched_at = launched_at
            self._process_group = self.process.pid if os.name == "posix" else None
            self._last_at = None
            self._stdout_buffer = b""
            # 웹 요청은 이 실행에서 새로 수신한 준비 입력을 기다린다.
            self._start_permitted = robot_id is None
            self._start_sent = False
            self._supervision_enabled = True
            self._web_supervised = robot_id is not None
            self.state = "awaiting-start"
            return "autonomy-process-started"

    def set_start_permitted(self, permitted: bool) -> None:
        """감독 실행기의 다음 ping에만 시작 프레임을 보낸다.

        subprocess를 시작한 사실만으로는 r61 주행 허용을 보내지 않는다.
        """
        with self._lock:
            self._start_permitted = permitted is True

    def poll_confirmations(self) -> None:
        """현재 작업 폴더에 게시된 장비 확인 이벤트만 처리한다."""
        with self._lock:
            self.poll()
            if (self.run_id is not None and self.process is None and self._web_supervised
                    and not self._start_sent and not self.started):
                self.stop()
                self.state = "start-failed"
            self._relay_supervision_frames()
            if self.run_id is None or self._confirmation_dir is None:
                return
            kind = "end" if self.started else "start"
            if kind == "start" and self.process is None:
                return
            path = self._confirmation_dir / f".confirmed-{kind}.json"
            try:
                with path.open("rb") as stream:
                    raw = stream.read(4097)
            except FileNotFoundError:
                return
            if len(raw) > 4096:
                raise ValueError("작업 확인 이벤트가 너무 큽니다.")
            event = json.loads(raw)
            if (not isinstance(event, dict) or event.get("runId") != self.run_id
                    or event.get("kind") != kind or not isinstance(event.get("signalAt"), str)):
                raise ValueError("작업 확인 이벤트가 현재 실행과 일치하지 않습니다.")
            stamp = datetime.fromisoformat(event["signalAt"].replace("Z", "+00:00"))
            if stamp.tzinfo is None or not self._launched_at <= stamp <= datetime.now(timezone.utc):
                raise ValueError("작업 확인 이벤트의 시각이 유효하지 않습니다.")
            if kind == "start":
                self.confirm_started(self.run_id, event["signalAt"])
            else:
                self.confirm_ended(self.run_id, event["signalAt"])

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
                self._close_process_pipes()
                # 정상 exit도 실제 작업 완료의 증거로 사용하지 않는다.
                self.state = "end-unconfirmed" if self.run_id is not None else "end-confirmed"

    def _relay_supervision_frames(self) -> None:
        if not self._supervision_enabled or self.process is None or self.process.stdout is None or self.process.stdin is None:
            return
        try:
            readable, _, _ = select.select([self.process.stdout], [], [], 0)
        except (OSError, ValueError, TypeError):
            return
        if not readable:
            return
        try:
            data = os.read(self.process.stdout.fileno(), 4096)
        except (OSError, ValueError):
            return
        if not data:
            return
        self._stdout_buffer = (self._stdout_buffer + data)[-8192:]
        records = self._stdout_buffer.split(b"\n")
        self._stdout_buffer = records.pop()
        for raw in records:
            from .ssh_latched_frames import heartbeat_reply
            reply = heartbeat_reply(raw + b"\n", start=self._start_permitted and not self._start_sent)
            if reply is None:
                continue
            try:
                self.process.stdin.write(reply)
                self.process.stdin.flush()
            except (BrokenPipeError, OSError):
                return
            if reply.endswith(b" r\n"):
                self._start_sent = True
                self.state = "start-requested"

    def _close_process_pipes(self) -> None:
        process, self.process = self.process, None
        if process is not None:
            for pipe in (process.stdin, process.stdout):
                if pipe is not None:
                    pipe.close()

    def stop(self) -> None:
        with self._lock:
            self._supervision_enabled = False
            self._start_permitted = False
            cancelled_before_start = self._web_supervised and not self._start_sent and not self.started
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
                self._close_process_pipes()
                self._process_group = None
                self._start_sent = False
                self.state = "end-unconfirmed"
            if cancelled_before_start:
                self.run_id = None
                self.state = "idle"
            self._web_supervised = False

    def _emit(self, kind: str, at: str) -> None:
        stamp = datetime.fromisoformat(at.replace("Z", "+00:00"))
        if stamp.tzinfo is None or (self._last_at is not None and stamp < self._last_at):
            raise ValueError("작업 신호에는 시간 순서가 유효한 UTC 기준 시각이 필요합니다.")
        self.on_signal({"id": str(uuid4()), "runId": self.run_id, "kind": kind, "signalAt": at})
        self._last_at = stamp.astimezone(timezone.utc)
