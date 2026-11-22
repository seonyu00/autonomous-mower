"""웹·SSH 제어권 인계 시나리오를 모의 시계와 메모리 상태로 검증한다."""

import unittest
from dataclasses import dataclass


@dataclass(frozen=True)
class _Readiness:
    robot_id: str
    observed_at: int
    ready: bool


class _Simulation:
    """실행기·네트워크·장치에 접근하지 않는 시험 대역."""

    def __init__(self):
        self.now = 0
        self.report = None
        self.web_version = None
        self.owner = None
        self.deadline = 0
        self.remote_override = False
        self.events = []

    def set_web_lock(self, version):
        if version != self.web_version and self.owner == "web":
            self.stop("control-lock-changed")
        self.web_version = version

    def set_remote_override(self, active):
        self.remote_override = active
        if active:
            # 개입 해제 뒤에는 새 보고와 별도 시작이 필요하다.
            self.report = None
            self.stop("remote-override")

    def advance(self, milliseconds):
        self.now += milliseconds
        if self.owner is not None and self.now >= self.deadline:
            self.stop("connection-expired")

    def start(self, source, robot_id, version=None):
        if source == "web" and (version is None or version != self.web_version):
            return "control-lock-conflict"
        if self.owner is not None:
            return "already-running"
        if (self.remote_override or self.report is None or self.report.robot_id != robot_id
                or self.report.ready is not True or not 0 <= self.now - self.report.observed_at < 500):
            return "readiness-unconfirmed"
        self.owner = source
        self.deadline = self.now + 500
        self.events.append(("started", source))
        return "started"

    def heartbeat(self, source):
        if source == self.owner:
            self.deadline = self.now + 500

    def stop(self, reason):
        if self.owner is not None:
            self.events.append(("stopped", reason))
            self.owner = None


class AutoSupervisionSimulationTest(unittest.TestCase):
    def setUp(self):
        self.sim = _Simulation()
        self.sim.set_web_lock(4)
        self.sim.report = _Readiness("trial", 0, True)

    def test_requires_current_lock_and_fresh_report_for_same_robot(self):
        self.assertEqual(self.sim.start("web", "trial", 3), "control-lock-conflict")
        self.assertEqual(self.sim.start("web", "other", 4), "readiness-unconfirmed")
        self.sim.advance(500)
        self.assertEqual(self.sim.start("web", "trial", 4), "readiness-unconfirmed")
        self.assertEqual(self.sim.events, [])

    def test_web_and_ssh_share_exclusive_ownership_until_stop(self):
        self.assertEqual(self.sim.start("web", "trial", 4), "started")
        self.assertEqual(self.sim.start("web", "trial", 4), "already-running")
        self.assertEqual(self.sim.start("ssh", "trial"), "already-running")
        self.sim.stop("operator-stop")
        self.assertEqual(self.sim.start("ssh", "trial"), "started")
        self.assertEqual(self.sim.start("web", "trial", 4), "already-running")

    def test_disconnect_and_reconnect_do_not_restart(self):
        self.assertEqual(self.sim.start("web", "trial", 4), "started")
        self.sim.advance(400)
        self.sim.heartbeat("web")
        self.sim.advance(500)
        self.sim.heartbeat("web")
        self.assertIsNone(self.sim.owner)
        self.assertEqual(self.sim.events[-1], ("stopped", "connection-expired"))
        self.sim.report = _Readiness("trial", self.sim.now, True)
        self.assertEqual(self.sim.start("web", "trial", 4), "started")

    def test_remote_override_stops_and_requires_new_report_and_start(self):
        self.assertEqual(self.sim.start("web", "trial", 4), "started")
        self.sim.set_remote_override(True)
        self.assertEqual(self.sim.events[-1], ("stopped", "remote-override"))
        self.sim.set_remote_override(False)
        self.sim.heartbeat("web")
        self.assertEqual(self.sim.start("web", "trial", 4), "readiness-unconfirmed")
        self.sim.report = _Readiness("trial", self.sim.now, True)
        self.assertEqual(self.sim.start("web", "trial", 4), "started")

    def test_releasing_web_lock_stops_active_session(self):
        self.assertEqual(self.sim.start("web", "trial", 4), "started")
        self.sim.set_web_lock(None)
        self.assertEqual(self.sim.events[-1], ("stopped", "control-lock-changed"))
        self.assertEqual(self.sim.start("web", "trial", 4), "control-lock-conflict")
