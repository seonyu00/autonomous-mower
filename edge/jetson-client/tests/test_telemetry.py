import json
from types import SimpleNamespace
import unittest

from jetson_mower_client.telemetry import build_telemetry_payload


class TelemetryTest(unittest.TestCase):
    def test_missing_sensors_are_json_null_instead_of_default_measurements(self):
        payload = build_telemetry_payload("test", "2026-10-21T00:00:00Z")
        decoded = json.loads(json.dumps(payload, allow_nan=False))
        for key in ["latitude", "longitude", "batteryLevel", "speedMps", "signalStrength", "mode", "workState"]:
            self.assertIsNone(decoded[key])

    def test_gps_can_arrive_without_battery_speed_or_mode(self):
        fix = SimpleNamespace(status=SimpleNamespace(status=0), latitude=37.5, longitude=127.0)
        payload = build_telemetry_payload("test", "now", fix=fix, fix_age_seconds=0)
        self.assertEqual((payload["latitude"], payload["longitude"]), (37.5, 127.0))
        self.assertIsNone(payload["batteryLevel"])
        self.assertIsNone(payload["mode"])

    def test_invalid_or_unfixed_gps_does_not_hide_known_state(self):
        for status, latitude in [(-1, 37.5), (0, float("nan")), (0, 91.0)]:
            fix = SimpleNamespace(status=SimpleNamespace(status=status), latitude=latitude, longitude=127.0)
            payload = build_telemetry_payload("test", "now", fix=fix, fix_age_seconds=0, mode="emergency", work_state="error")
            self.assertIsNone(payload["latitude"])
            self.assertIsNone(payload["longitude"])
            self.assertEqual(payload["mode"], "emergency")
            json.dumps(payload, allow_nan=False)

    def test_three_seconds_without_gps_turns_only_position_unknown(self):
        fix = SimpleNamespace(status=SimpleNamespace(status=0), latitude=37.5, longitude=127.0)
        fresh = build_telemetry_payload("test", "now", fix=fix, fix_age_seconds=2.999, mode="manual")
        stale = build_telemetry_payload("test", "now", fix=fix, fix_age_seconds=3.0, mode="manual")
        self.assertEqual(fresh["latitude"], 37.5)
        self.assertIsNone(stale["latitude"])
        self.assertIsNone(stale["longitude"])
        self.assertEqual(stale["mode"], "manual")
