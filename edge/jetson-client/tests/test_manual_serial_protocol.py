import unittest

from jetson_mower_client.manual_serial_protocol import encode_packet, manual_wheels


class ManualSerialProtocolTest(unittest.TestCase):
    def test_wheel_directions_match_field_test(self):
        self.assertEqual(manual_wheels("forward", 1), (1900, 1900))
        self.assertEqual(manual_wheels("backward", 1), (1100, 1100))
        self.assertEqual(manual_wheels("left", 1), (1900, 1100))
        self.assertEqual(manual_wheels("right", 1), (1100, 1900))
        self.assertEqual(manual_wheels("stop", 1), (1500, 1500))

    def test_packet_checksum_and_engine_field(self):
        self.assertEqual(encode_packet(1, 1600, 1600), b"$1,1600,1600,0,2D*\n")

    def test_fourfold_limit_applies_to_every_direction_and_wire_packet(self):
        for direction in ('forward', 'reverse', 'left', 'right', 'rotate-left', 'rotate-right'):
            with self.subTest(direction=direction):
                values = manual_wheels(direction, 1)
                self.assertTrue(all(1100 <= value <= 1900 for value in values))
        self.assertEqual(manual_wheels('forward', 0.2), (1740, 1740))
        for direction, speed in (('forward', 0.6), ('reverse', 0.45), ('left', 0.35), ('right', 0.35)):
            with self.subTest(direction=direction):
                self.assertTrue(all(abs(value - 1500) == 400 for value in manual_wheels(direction, speed)))
        for values in ((1901, 1500), (1500, 1099)):
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
