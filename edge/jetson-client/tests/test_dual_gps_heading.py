from dataclasses import replace
import math
import unittest

from jetson_mower_client.dual_gps_heading import AntennaFix, heading_enu_rad


class DualGpsHeadingTest(unittest.TestCase):
    def setUp(self):
        self.main = AntennaFix(1000, 10, 37, 127, 4)
        self.auxiliary = replace(
            self.main, latitude=37 + math.degrees(0.43 / 6378137))
        self.options = dict(now_monotonic_s=10.1, baseline_m=0.43,
                            baseline_tolerance_m=0.05, main_to_aux_body_rad=0,
                            max_age_s=1, max_time_difference_s=0)

    def test_north_and_sideways_mount(self):
        self.assertAlmostEqual(heading_enu_rad(self.main, self.auxiliary,
                                             **self.options), math.pi / 2)
        self.options['main_to_aux_body_rad'] = math.pi / 2
        self.assertAlmostEqual(heading_enu_rad(self.main, self.auxiliary,
                                             **self.options), 0)

    def test_swapping_antenna_roles_reverses_body_heading(self):
        original = heading_enu_rad(self.main, self.auxiliary, **self.options)
        reversed_heading = heading_enu_rad(self.auxiliary, self.main, **self.options)
        difference = math.atan2(math.sin(reversed_heading - original),
                                math.cos(reversed_heading - original))
        self.assertAlmostEqual(abs(difference), math.pi)

    def test_float_missing_time_stale_future_and_bad_baseline_rejected(self):
        for values in (dict(quality=5), dict(measured_at_s=1001),
                       dict(received_monotonic_s=9),
                       dict(received_monotonic_s=11), dict(latitude=37),
                       dict(longitude=float('nan'))):
            with self.subTest(values=values), self.assertRaises(ValueError):
                heading_enu_rad(self.main, replace(self.auxiliary, **values),
                                **self.options)

    def test_invalid_configuration_rejected(self):
        for values in (dict(baseline_m=0), dict(baseline_tolerance_m=0.5),
                       dict(max_age_s=0), dict(max_time_difference_s=-1),
                       dict(main_to_aux_body_rad=float('nan'))):
            with self.subTest(values=values), self.assertRaises(ValueError):
                heading_enu_rad(self.main, self.auxiliary,
                                **dict(self.options, **values))


if __name__ == '__main__':
    unittest.main()
