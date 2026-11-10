"""기기 간 시계 비교 없이 한 번 사용할 확인값을 관리한다.

아직 수동 제어 경로에 연결되지 않은 검증용 구성 요소다.
"""

import secrets
import threading


class ManualChallenge:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: tuple[str, str, int] | None = None

    def issue(self, purpose: str, now_ns: int) -> str:
        if purpose not in {"rearm", "movement"}:
            raise ValueError("invalid-challenge-purpose")
        with self._lock:
            token = secrets.token_urlsafe(32)
            self._pending = (token, purpose, now_ns)
            return token

    def consume(self, token: str, purpose: str, now_ns: int, max_age_ns: int) -> int | None:
        with self._lock:
            pending = self._pending
            if pending is None or not isinstance(token, str) or not token.isascii():
                return None
            expected, expected_purpose, issued_at = pending
            if not secrets.compare_digest(token, expected) or purpose != expected_purpose:
                return None
            self._pending = None
            age = now_ns - issued_at
            if not 0 <= age < max_age_ns:
                return None
            return age

    def invalidate(self) -> None:
        with self._lock:
            self._pending = None
