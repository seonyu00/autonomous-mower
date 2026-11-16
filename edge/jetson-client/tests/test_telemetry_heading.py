import json
import unittest

from jetson_mower_client.telemetry_heading import TelemetryHeading
from jetson_mower_client.telemetry import build_telemetry_payload


class TelemetryHeadingTest(unittest.TestCase):
    def status(self):
        return json.dumps(dict(valid=True, source='dual_gps_fixed_baseline',
            main_quality=4, aux_quality=4, headingDegrees=274,
            headingObservedAt='2026-11-16T00:00:00+00:00'))

    def setUp(self):
        self.heading = TelemetryHeading()
        self.epoch = 1794787200.

    def test_fresh_body_heading_reaches_payload(self):
        self.heading.update(self.status(), 10, self.epoch + .5)
        payload = build_telemetry_payload('A', 'now', heading=self.heading.snapshot(10.1, self.epoch + .6))
        self.assertEqual(payload['headingDegrees'], 274)
        self.assertEqual(payload['headingSource'], 'dual-gps')

    def test_repeated_status_does_not_refresh_old_measurement(self):
        self.heading.update(self.status(), 10, self.epoch)
        self.heading.update(self.status(), 12.9, self.epoch + 2.9)
        self.assertIsNone(self.heading.snapshot(13, self.epoch + 3))

    def test_invalid_status_clears_heading_without_imu_fallback(self):
        self.heading.update(self.status(), 10, self.epoch)
        self.heading.update('{"valid":false}', 10.1, self.epoch + .1)
        self.assertIsNone(self.heading.snapshot(10.1, self.epoch + .1))
        self.heading.update(self.status(), 10.2, self.epoch + .2)
        self.assertIsNone(self.heading.snapshot(10.2, self.epoch + .2))

    def test_unknown_source_future_and_nan_are_rejected(self):
        initial = json.loads(self.status())
        for changes in ({'source': 'imu'}, {'headingDegrees': float('nan')},
                        {'headingDegrees': 360}, {'aux_quality': 5},
                        {'headingObservedAt': '2026-11-16T00:00:10Z'}):
            self.heading.update(json.dumps(dict(initial, **changes)), 10, self.epoch)
            self.assertIsNone(self.heading.snapshot(10, self.epoch))
