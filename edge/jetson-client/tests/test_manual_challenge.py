import unittest

from jetson_mower_client.manual_challenge import ManualChallenge


class ManualChallengeTest(unittest.TestCase):
    def test_single_use_and_elapsed_age(self):
        challenge = ManualChallenge()
        token = challenge.issue("movement", 10_000_000_000)
        self.assertEqual(challenge.consume(token, "movement", 10_200_000_000, 350_000_000), 200_000_000)
        self.assertIsNone(challenge.consume(token, "movement", 10_210_000_000, 350_000_000))

    def test_expired_or_backwards_elapsed_time_is_rejected(self):
        challenge = ManualChallenge()
        token = challenge.issue("movement", 10_000_000_000)
        self.assertEqual(challenge.consume(token, "movement", 10_349_999_999, 350_000_000), 349_999_999)
        token = challenge.issue("movement", 10_000_000_000)
        self.assertIsNone(challenge.consume(token, "movement", 10_350_000_000, 350_000_000))
        token = challenge.issue("movement", 10_000_000_000)
        self.assertIsNone(challenge.consume(token, "movement", 10_350_000_001, 350_000_000))
        token = challenge.issue("movement", 10_000_000_000)
        self.assertIsNone(challenge.consume(token, "movement", 9_000_000_000, 350_000_000))

    def test_purpose_and_session_invalidation(self):
        challenge = ManualChallenge()
        old = challenge.issue("rearm", 100)
        current = challenge.issue("movement", 110)
        self.assertIsNone(challenge.consume(old, "rearm", 120, 200))
        self.assertIsNone(challenge.consume("잘못된 값", "movement", 120, 200))
        self.assertIsNone(challenge.consume(current, "rearm", 120, 200))
        challenge.invalidate()
        self.assertIsNone(challenge.consume(current, "movement", 120, 200))

    def test_other_instance_does_not_accept_token(self):
        old = ManualChallenge().issue("rearm", 100)
        self.assertIsNone(ManualChallenge().consume(old, "rearm", 110, 200))


if __name__ == "__main__":
    unittest.main()
