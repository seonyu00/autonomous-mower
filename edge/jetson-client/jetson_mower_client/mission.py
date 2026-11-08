"""실제 확인 신호 어댑터를 연결하기 전의 경로 교체 상태 계약이다."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from uuid import uuid4


@dataclass(frozen=True)
class ReviewedPlan:
    plan_id: str
    version: int
    sha256: str


class Mission:
    """정지 요청 ACK나 파일 보고로 주행·물리 정지를 추정하지 않는다."""
    def __init__(self, request_stop: Callable[[str], None], regenerate: Callable[[int], ReviewedPlan]):
        self.request_stop = request_stop
        self.regenerate = regenerate
        self.state = "review-required"
        self.plan: ReviewedPlan | None = None
        self.latest_version: int | None = None
        self.execution_id: str | None = None
        self.stop_id: str | None = None

    def review(self, plan: ReviewedPlan) -> None:
        if self.state not in {"review-required", "plan-ready", "replan-failed"}:
            raise ValueError("진행 중인 작업의 경로를 교체할 수 없습니다.")
        if self.latest_version is not None and plan.version != self.latest_version:
            raise ValueError("오래된 구역의 경로입니다.")
        self.plan = plan
        self.latest_version = plan.version
        self.state = "plan-ready"

    def request_auto(self, current_version: int) -> str:
        if self.state != "plan-ready" or self.plan is None or self.plan.version != current_version:
            raise ValueError("현재 구역의 경로를 먼저 확인하세요.")
        self.execution_id = str(uuid4())
        self.state = "preparing"
        return self.execution_id

    def file_prepared(self, execution_id: str, plan_id: str, sha256: str) -> None:
        if self.state != "preparing" or execution_id != self.execution_id or self.plan is None or (plan_id,sha256) != (self.plan.plan_id,self.plan.sha256):
            raise ValueError("현재 준비 요청과 보고가 일치하지 않습니다.")
        self.state = "readiness-unconfirmed"

    def confirm_started(self, execution_id: str, *, readiness_verified: bool) -> None:
        # 운영 어댑터에서 실제 GPS·방향·적용 경로·제어 중재를 확인한 후에만 호출한다.
        if self.state != "readiness-unconfirmed" or execution_id != self.execution_id or readiness_verified is not True:
            raise ValueError("실제 주행 준비가 확인되지 않았습니다.")
        self.state = "running"

    def zone_changed(self, version: int) -> None:
        if self.latest_version is not None and version <= self.latest_version:
            return
        self.latest_version = version
        if self.state in {"running", "preparing", "readiness-unconfirmed"}:
            self.state = "stop-unconfirmed"
            self.stop_id = str(uuid4())
            self.request_stop(self.stop_id)
        elif self.state != "stop-unconfirmed":
            self.plan = None
            self.state = "review-required"

    def confirm_stopped(self, execution_id: str, stop_id: str) -> None:
        # 실제 정지 확인 전용 어댑터만 사용하며, 명령 수락·프로세스 종료로 호출하지 않는다.
        if self.state != "stop-unconfirmed" or execution_id != self.execution_id or stop_id != self.stop_id:
            raise ValueError("현재 실행의 정지 확인이 아닙니다.")
        version = self.latest_version
        self.plan = None
        self.state = "replanning"
        try:
            plan = self.regenerate(version)
            if plan.version != self.latest_version:
                raise ValueError("계산 중 구역이 변경됐습니다.")
            self.state = "review-required"
            self.plan = plan
            # 새 AUTO 요청은 review로 명시적으로 확인한 뒤에만 받는다.
        except Exception:
            self.state = "replan-failed"
            raise
