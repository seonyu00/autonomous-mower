from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from jetson_mower_client.command_mapping import is_stale_client_command, manual_to_twist, parse_iso_utc
from jetson_mower_client.topics import MowerTopics, command_type_from_topic


class ManualToTwistTest(unittest.TestCase):
    def test_maps_forward_to_positive_linear_x(self) -> None:
        twist = manual_to_twist({"direction": "forward", "speed": 0.6}, 1.5, 2.0)

        self.assertAlmostEqual(twist.linear_x, 0.9)
        self.assertEqual(twist.angular_z, 0.0)

    def test_maps_backward_and_reverse_to_negative_linear_x(self) -> None:
        backward = manual_to_twist({"direction": "backward", "speed": 0.5}, 2.0, 1.0)
        reverse = manual_to_twist({"direction": "reverse", "speed": 0.5}, 2.0, 1.0)

        self.assertEqual(backward.linear_x, -1.0)
        self.assertEqual(reverse.linear_x, -1.0)

    def test_maps_left_and_right_to_angular_z(self) -> None:
        left = manual_to_twist({"direction": "left", "speed": 0.25}, 1.0, 4.0)
        right = manual_to_twist({"direction": "right", "speed": 0.25}, 1.0, 4.0)

        self.assertEqual(left.angular_z, 1.0)
        self.assertEqual(right.angular_z, -1.0)

    def test_clamps_speed(self) -> None:
        twist = manual_to_twist({"direction": "forward", "speed": 2.0}, 1.0, 1.0)

        self.assertEqual(twist.linear_x, 1.0)

    def test_rejects_unknown_direction(self) -> None:
        with self.assertRaises(ValueError):
            manual_to_twist({"direction": "diagonal", "speed": 0.5}, 1.0, 1.0)


class StalenessTest(unittest.TestCase):
    def test_parses_nanosecond_fraction_from_backend_timestamp(self) -> None:
        parsed = parse_iso_utc("2026-06-12T13:38:47.626032900Z")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.microsecond, 626032)

    def test_detects_stale_client_command(self) -> None:
        now = datetime(2026, 6, 1, 1, 0, 1, tzinfo=timezone.utc)
        old = (now - timedelta(milliseconds=600)).isoformat().replace("+00:00", "Z")

        self.assertTrue(is_stale_client_command(old, 500, now))

    def test_accepts_fresh_client_command(self) -> None:
        now = datetime(2026, 6, 1, 1, 0, 1, tzinfo=timezone.utc)
        fresh = (now - timedelta(milliseconds=100)).isoformat().replace("+00:00", "Z")

        self.assertFalse(is_stale_client_command(fresh, 500, now))


class TopicTest(unittest.TestCase):
    def test_topics_match_contract(self) -> None:
        topics = MowerTopics("MOWER-01")

        self.assertEqual(topics.manual_command, "mowers/MOWER-01/commands/manual")
        self.assertEqual(topics.stop_command, "mowers/MOWER-01/commands/stop")
        self.assertEqual(topics.estop_command, "mowers/MOWER-01/commands/estop")
        self.assertEqual(topics.mode_command, "mowers/MOWER-01/commands/mode")
        self.assertEqual(topics.attachment_command, "mowers/MOWER-01/commands/attachment")
        self.assertEqual(topics.command_ack, "mowers/MOWER-01/commands/ack")

    def test_command_type_from_topic(self) -> None:
        self.assertEqual(command_type_from_topic("mowers/MOWER-01/commands/manual"), "manual-command")
        self.assertEqual(command_type_from_topic("mowers/MOWER-01/commands/estop"), "emergency-stop")


if __name__ == "__main__":
    unittest.main()
