import unittest
from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor

from jetson_mower_client.manual_challenge import ChallengeScope, ManualChallenge


REARM = ChallengeScope("rearm", "robot", "operator", 1)
MOVE = ChallengeScope("movement", "robot", "operator", 1, "arm", "press", "forward", 0.6)


class ManualChallengeTest(unittest.TestCase):
    def test_single_use_and_elapsed_age(self):
        challenge = ManualChallenge()
        token = challenge.issue(MOVE, 10_000_000_000)
        self.assertEqual(challenge.consume(token, MOVE, 10_200_000_000, 350_000_000), 200_000_000)
        self.assertIsNone(challenge.consume(token, MOVE, 10_210_000_000, 350_000_000))

    def test_expiry_boundary_and_backwards_time(self):
        challenge = ManualChallenge()
        for age, expected in ((349_999_999, 349_999_999), (350_000_000, None),
                              (350_000_001, None), (-1, None)):
            token = challenge.issue(MOVE, 10_000_000_000)
            self.assertEqual(challenge.consume(token, MOVE, 10_000_000_000 + age, 350_000_000), expected)

    def test_every_scope_field_must_match(self):
        challenge = ManualChallenge()
        token = challenge.issue(MOVE, 100)
        variations = [REARM, replace(MOVE, robot_id="other"), replace(MOVE, operator_id="other"),
                      replace(MOVE, lock_version=2), replace(MOVE, arm_id="other"),
                      replace(MOVE, press_id="other"), replace(MOVE, direction="left"),
                      replace(MOVE, speed=0.5)]
        for scope in variations:
            self.assertIsNone(challenge.consume(token, scope, 120, 200))
        self.assertIsNone(challenge.consume("잘못된 값", MOVE, 120, 200))
        self.assertEqual(challenge.consume(token, MOVE, 120, 200), 20)

    def test_invalid_scopes_are_not_issued(self):
        challenge = ManualChallenge()
        for scope in (replace(REARM, arm_id="arm"), replace(REARM, lock_version=-1),
                      replace(MOVE, press_id=""), replace(MOVE, speed=float("nan")),
                      replace(MOVE, speed=True), replace(MOVE, direction="stop")):
            with self.assertRaises(ValueError):
                challenge.issue(scope, 100)

    def test_replacement_invalidation_and_restart(self):
        challenge = ManualChallenge()
        old = challenge.issue(REARM, 100)
        current = challenge.issue(MOVE, 110)
        self.assertIsNone(challenge.consume(old, REARM, 120, 200))
        self.assertIsNone(ManualChallenge().consume(current, MOVE, 120, 200))
        challenge.invalidate()
        self.assertIsNone(challenge.consume(current, MOVE, 120, 200))

    def test_concurrent_consumers_only_one_succeeds(self):
        challenge = ManualChallenge()
        token = challenge.issue(MOVE, 100)
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda _: challenge.consume(token, MOVE, 120, 200), range(20)))
        self.assertEqual(results.count(20), 1)


if __name__ == "__main__":
    unittest.main()
