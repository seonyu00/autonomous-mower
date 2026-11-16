from datetime import datetime, timezone
import unittest

from jetson_mower_client.dual_gps_nmea import NmeaEpochs, coordinate, fields


def sentence(body):
    checksum = 0
    for char in body:
        checksum ^= ord(char)
    return f'${body}*{checksum:02X}'


GGA = sentence('GNGGA,120000.25,3700.000,N,12700.000,E,4,20,0.7,50,M,0,M,,')
RMC = sentence('GNRMC,120000.25,A,3700.000,N,12700.000,E,0,0,161126,,,A')
NOW = datetime(2026, 11, 16, 12, tzinfo=timezone.utc).timestamp() + .5


class NmeaEpochTest(unittest.TestCase):
    def test_matches_both_arrival_orders_and_preserves_fractional_measurement_time(self):
        for order in ((GGA, RMC), (RMC, GGA)):
            with self.subTest(order=order):
                parser = NmeaEpochs()
                self.assertIsNone(parser.add(order[0], 10, NOW))
                fix, raw = parser.add(order[1], 10.1, NOW)
                self.assertEqual(fix.measured_at_s, NOW - .25)
                self.assertEqual((fix.latitude, fix.longitude, fix.quality), (37, 127, 4))
                self.assertEqual(raw, GGA)

    def test_wrong_checksum_expired_and_future_measurements_rejected(self):
        with self.assertRaises(ValueError):
            fields(GGA[:-2] + 'FF')
        for now in (NOW + 3, NOW - 1):
            parser = NmeaEpochs()
            parser.add(GGA, 10, now)
            with self.assertRaises(ValueError):
                parser.add(RMC, 10, now)

    def test_different_epochs_and_duplicate_measurements_do_not_emit(self):
        parser = NmeaEpochs()
        parser.add(GGA, 10, NOW)
        later = sentence('GNRMC,120001.25,A,3700.000,N,12700.000,E,0,0,161126,,,A')
        self.assertIsNone(parser.add(later, 10, NOW))
        self.assertIsNotNone(parser.add(RMC, 10, NOW))
        self.assertIsNone(parser.add(GGA, 10.2, NOW))
        self.assertIsNone(parser.add(RMC, 10.2, NOW))

    def test_gga_alone_does_not_invent_date(self):
        self.assertIsNone(NmeaEpochs().add(GGA, 10, NOW))

    def test_coordinate_minutes_out_of_range_rejected(self):
        with self.assertRaises(ValueError):
            coordinate('3760.0', 'N', 2)


if __name__ == '__main__':
    unittest.main()
