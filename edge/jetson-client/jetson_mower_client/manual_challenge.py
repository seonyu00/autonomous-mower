"""기기 간 시계 비교 없이 한 번 사용할 확인값을 관리한다.

아직 수동 제어 경로에 연결되지 않은 검증용 구성 요소다.
"""

import secrets
import threading
from dataclasses import dataclass


@dataclass(frozen=True)
class ChallengeScope:
    purpose: str
    robot_id: str
    operator_id: str
    lock_version: int
    arm_id: str | None = None
    press_id: str | None = None
    direction: str | None = None
    speed: float | None = None

    def valid(self) -> bool:
        if (self.purpose not in {"rearm", "movement"}
                or not isinstance(self.robot_id, str) or not self.robot_id
                or not isinstance(self.operator_id, str) or not self.operator_id
                or not isinstance(self.lock_version, int) or isinstance(self.lock_version, bool)
                or self.lock_version < 0):
            return False
        if self.purpose == "rearm":
            return all(value is None for value in (self.arm_id, self.press_id, self.direction, self.speed))
        return (isinstance(self.arm_id, str) and bool(self.arm_id)
                and isinstance(self.press_id, str) and bool(self.press_id)
                and self.direction in {"forward", "reverse", "left", "right"}
                and isinstance(self.speed, (float, int)) and not isinstance(self.speed, bool)
                and 0 < self.speed <= 1)


class ManualChallenge:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: tuple[str, ChallengeScope, int] | None = None

    def issue(self, scope: ChallengeScope, now_ns: int) -> str:
        if not isinstance(scope, ChallengeScope) or not scope.valid():
            raise ValueError("invalid-challenge-scope")
        with self._lock:
            token = secrets.token_urlsafe(32)
            self._pending = (token, scope, now_ns)
            return token

    def consume(self, token: str, scope: ChallengeScope, now_ns: int, max_age_ns: int) -> int | None:
        with self._lock:
            pending = self._pending
            if pending is None or not isinstance(token, str) or not token.isascii():
                return None
            expected, expected_scope, issued_at = pending
            if not secrets.compare_digest(token, expected) or scope != expected_scope:
                return None
            self._pending = None
            age = now_ns - issued_at
            if not 0 <= age < max_age_ns:
                return None
            return age

    def invalidate(self) -> None:
        with self._lock:
            self._pending = None
