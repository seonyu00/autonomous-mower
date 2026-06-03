from __future__ import annotations

import unittest

from jetson_mower_client.config import _ros_config
from jetson_mower_client.qos_config import normalize_durability, normalize_reliability


class QosConfigTest(unittest.TestCase):
    def test_cmd_vel_qos_default_is_reliable_and_volatile(self) -> None:
        config = _ros_config({})

        self.assertEqual(config.cmd_vel_qos_depth, 10)
        self.assertEqual(config.cmd_vel_qos_durability, "volatile")
        self.assertEqual(config.cmd_vel_qos_reliability, "reliable")

    def test_cmd_vel_qos_values_are_normalized(self) -> None:
        config = _ros_config(
            {
                "cmd_vel_qos_depth": 5,
                "cmd_vel_qos_durability": "TRANSIENT_LOCAL",
                "cmd_vel_qos_reliability": "BEST_EFFORT",
            }
        )

        self.assertEqual(config.cmd_vel_qos_depth, 5)
        self.assertEqual(config.cmd_vel_qos_durability, "transient_local")
        self.assertEqual(config.cmd_vel_qos_reliability, "best_effort")

    def test_rejects_unsupported_qos_values(self) -> None:
        with self.assertRaises(ValueError):
            normalize_durability("invalid")
        with self.assertRaises(ValueError):
            normalize_reliability("invalid")


if __name__ == "__main__":
    unittest.main()

