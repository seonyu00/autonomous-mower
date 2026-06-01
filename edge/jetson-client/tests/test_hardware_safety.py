from __future__ import annotations

import unittest

from jetson_mower_client.hardware_safety import EMERGENCY_MODE_VALUE, publish_emergency_stop_outputs


class Vector3:
    def __init__(self) -> None:
        self.x = 99.0
        self.y = 99.0
        self.z = 99.0


class TwistMessage:
    def __init__(self) -> None:
        self.linear = Vector3()
        self.angular = Vector3()


class Int8Message:
    def __init__(self) -> None:
        self.data = 0


class BoolMessage:
    def __init__(self) -> None:
        self.data = True


class FakePublisher:
    def __init__(self, name: str, calls: list[str]) -> None:
        self.name = name
        self.calls = calls
        self.messages: list[object] = []

    def publish(self, message: object) -> None:
        self.calls.append(self.name)
        self.messages.append(message)


class HardwareSafetyTest(unittest.TestCase):
    def test_estop_publishes_zero_twist_emergency_mode_and_engine_off_in_order(self) -> None:
        calls: list[str] = []
        cmd_vel = FakePublisher("cmd_vel", calls)
        set_mode = FakePublisher("set_mode", calls)
        engine = FakePublisher("engine", calls)

        publish_emergency_stop_outputs(
            cmd_vel,
            set_mode,
            engine,
            TwistMessage,
            Int8Message,
            BoolMessage,
        )

        self.assertEqual(calls, ["cmd_vel", "set_mode", "engine"])

        twist = cmd_vel.messages[0]
        self.assertEqual(twist.linear.x, 0.0)
        self.assertEqual(twist.linear.y, 0.0)
        self.assertEqual(twist.linear.z, 0.0)
        self.assertEqual(twist.angular.x, 0.0)
        self.assertEqual(twist.angular.y, 0.0)
        self.assertEqual(twist.angular.z, 0.0)

        mode = set_mode.messages[0]
        self.assertEqual(mode.data, EMERGENCY_MODE_VALUE)

        engine_message = engine.messages[0]
        self.assertFalse(engine_message.data)


if __name__ == "__main__":
    unittest.main()

