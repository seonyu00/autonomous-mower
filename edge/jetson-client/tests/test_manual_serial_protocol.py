import unittest

from jetson_mower_client.manual_serial_protocol import encode_packet, manual_wheels


class ManualSerialProtocolTest(unittest.TestCase):
    def test_wheel_directions_match_field_test(self):
        self.assertEqual(manual_wheels("forward", 1), (1800, 1800))
        self.assertEqual(manual_wheels("backward", 1), (1200, 1200))
        self.assertEqual(manual_wheels("left", 1), (1800, 1200))
        self.assertEqual(manual_wheels("right", 1), (1200, 1800))
        self.assertEqual(manual_wheels("stop", 1), (1500, 1500))

    def test_packet_checksum_and_engine_field(self):
        self.assertEqual(encode_packet(1, 1600, 1600), b"$1,1600,1600,0,2D*\n")

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
