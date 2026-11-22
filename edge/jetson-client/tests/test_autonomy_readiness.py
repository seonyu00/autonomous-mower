import unittest

from jetson_mower_client.autonomy_readiness import Observation, readiness


class ReadinessTest(unittest.TestCase):
    def setUp(self):
        self.args = dict(
            now=10, max_age=1, expected_zone=(2, 11), actual_zone=(2, 11), authority_available=True,
            remote=Observation(False, 9.9),
            feedback=Observation(dict(report_fresh=True, override=False, reason="clear"), 9.9),
            pose=Observation(dict(valid=True, yaw_ready=True), 9.9),
            obstacles=Observation(dict(observation_fresh=True, pose_valid=True), 9.9),
        )

    def test_ready_only_when_all_inputs_are_current(self):
        self.assertIsNone(readiness(**self.args))

    def test_missing_stale_future_and_override_are_rejected(self):
        for key, observation in (
            ("remote", None), ("remote", Observation(True, 9.9)),
            ("feedback", Observation({"report_fresh": False}, 9.9)),
            ("pose", Observation({"valid": True, "yaw_ready": True}, 8)),
            ("obstacles", Observation({"pose_valid": True, "observation_fresh": True}, 11)),
        ):
            with self.subTest(key=key, observation=observation):
                self.assertIsNotNone(readiness(**(self.args | {key: observation})))

    def test_wrong_zone_and_missing_authority_are_rejected(self):
        self.assertEqual(readiness(**(self.args | {"actual_zone": (2, 12)})), "work-zone-mismatch")
        self.assertEqual(readiness(**(self.args | {"authority_available": False})), "authority-unavailable")
        self.assertEqual(readiness(**(self.args | {"expected_zone": None, "actual_zone": None})), "work-zone-mismatch")
        self.assertEqual(readiness(**(self.args | {"expected_zone": (True, 11), "actual_zone": (1, 11)})),
                         "work-zone-mismatch")
