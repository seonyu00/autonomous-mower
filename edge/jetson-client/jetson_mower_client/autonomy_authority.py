"""현재 웹 AUTO 명령의 제어권을 HTTPS로 확인한다."""

import json
import threading
import time
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, build_opener

class AutonomyAuthority:
    MAX_VALID_MS = 2_000
    POLL_SECONDS = 0.25

    def __init__(self, base_url: str, token: str, robot_id: str, command_id: str, lock_version: int):
        url = urlsplit(base_url)
        if (url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment
                or not token.strip() or "\r" in token or "\n" in token):
            raise ValueError("autonomy-authority-not-configured")
        from .web_work_zone import NoRedirect

        query = urlencode({"commandId": command_id, "lockVersion": lock_version})
        self._request = Request(f"{base_url.rstrip('/')}/api/control/{quote(robot_id, safe='')}/autonomy-authority?{query}",
                                headers={"Authorization": "Bearer " + token, "Cache-Control": "no-cache"})
        self._opener = build_opener(NoRedirect())
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._valid_until = time.monotonic() + self.MAX_VALID_MS / 1000
        self._confirmed = False
        self._last_check = "awaiting-first-response"
        self._last_check_ms = 0

    def start(self) -> None:
        threading.Thread(target=self._run, name="autonomy-authority", daemon=True).start()

    def close(self) -> None:
        self._stop.set()

    def status(self) -> str:
        with self._lock:
            if time.monotonic() >= self._valid_until:
                self.close()
            if self._stop.is_set():
                return "lost"
            return "valid" if self._confirmed else "pending"

    def _run(self) -> None:
        while not self._stop.is_set():
            scheduled = time.monotonic() + self.POLL_SECONDS
            self._poll()
            self._stop.wait(max(0, scheduled - time.monotonic()))

    def diagnostic(self) -> str:
        with self._lock:
            return f"check={self._last_check} duration_ms={self._last_check_ms}"

    def _poll(self) -> None:
        sent = time.monotonic()
        try:
            with self._opener.open(self._request, timeout=0.75) as response:
                raw = response.read(4097)
                if len(raw) > 4096:
                    raise ValueError("AUTO 제어권 응답 크기 초과")
                body = json.loads(raw)
            valid_ms = body["data"]["validForMs"] if body["success"] is True else 0
        except (OSError, HTTPException, KeyError, ValueError, TypeError) as error:
            # 일시적 조회 실패는 직전 유효시간을 연장하지 않는다.
            with self._lock:
                if isinstance(error, HTTPError):
                    self._last_check = f"http-{error.code}"
                elif isinstance(error, URLError):
                    self._last_check = type(error.reason).__name__
                else:
                    self._last_check = type(error).__name__
                self._last_check_ms = round((time.monotonic() - sent) * 1000)
            return
        with self._lock:
            received = time.monotonic()
            self._last_check_ms = round((received - sent) * 1000)
            if self._stop.is_set() or received >= self._valid_until:
                self._last_check = "response-after-deadline"
                self.close()
                return
            if type(valid_ms) is int and valid_ms == -1 and not self._confirmed:
                self._last_check = "awaiting-browser"
                return
            if type(valid_ms) is not int or not 0 < valid_ms <= self.MAX_VALID_MS:
                self._last_check = "permission-denied"
                self.close()
                return
            # 전송 시간을 보수적으로 전부 차감하고 시스템 시각 오차를 사용하지 않는다.
            self._valid_until = sent + valid_ms / 1000
            self._confirmed = True
            self._last_check = "approved"
