import unittest

from jetson_mower_client.manual_serial_protocol import encode_packet, manual_wheels


class ManualSerialProtocolTest(unittest.TestCase):
    def test_wheel_directions_match_field_test(self):
        self.assertEqual(manual_wheels("forward", 1), (1600, 1600))
        self.assertEqual(manual_wheels("backward", 1), (1400, 1400))
        self.assertEqual(manual_wheels("left", 1), (1600, 1400))
        self.assertEqual(manual_wheels("right", 1), (1400, 1600))
        self.assertEqual(manual_wheels("stop", 1), (1500, 1500))

    def test_packet_checksum_and_engine_field(self):
        self.assertEqual(encode_packet(1, 1600, 1600), b"$1,1600,1600,0,2D*\n")

    def test_trial_limit_applies_to_every_direction_and_wire_packet(self):
        for direction in ('forward', 'reverse', 'left', 'right', 'rotate-left', 'rotate-right'):
            with self.subTest(direction=direction):
                values = manual_wheels(direction, 1)
                self.assertTrue(all(1400 <= value <= 1600 for value in values))
        self.assertEqual(manual_wheels('forward', 0.2), (1560, 1560))
        for values in ((1601, 1500), (1500, 1399)):
            with self.subTest(values=values), self.assertRaises(ValueError):
                encode_packet(1, *values)

    def test_invalid_inputs_are_rejected(self):
        for speed in (-0.1, 1.1, float("nan")):
            with self.subTest(speed=speed), self.assertRaises(ValueError):
                manual_wheels("forward", speed)
        with self.assertRaises(ValueError):
            manual_wheels("unknown", 0.5)
        with self.assertRaises(ValueError):
            encode_packet(1, 999, 1500)


if __name__ == "__main__":
    unittest.main()
