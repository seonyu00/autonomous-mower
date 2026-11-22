import unittest

from jetson_mower_client.cpp_web_preview import Polygon, preview_frame


class PreviewFrameTest(unittest.TestCase):
    def test_route_is_cleared_when_observation_is_stale(self):
        zone = {"work_zone_id": "2", "work_zone_version": 11}
        snapshot = {
            **zone, "schema": "mower.obstacles.v1", "frame": "local_enu", "pose_valid": True,
            "observation_fresh": True, "observation_unix_ms": 9000, "generated_at_unix_ms": 9500,
            "session_id": "vision", "origin_wgs84": {"lon": 127, "lat": 36},
            "static_objects": [], "dynamic_objects": [],
        }
        packet = {
            **zone, "planner": "edge", "armed": False, "v": 0.0, "w": 0.0, "output_topic": None,
            "planning": {"route_revision": 1, "status": "unchanged",
                         "remaining_path": [{"lon": 127, "lat": 36}, {"lon": 127.01, "lat": 36}]},
            "replay": {**zone, "at_unix_ms": 10000, "command_at_unix_ms": None,
                       "input": {"obstacle_snapshot": snapshot}},
        }
        boundary = Polygon([(127, 36), (127.01, 36), (127, 36.01)])
        report, _ = preview_frame(packet, zone, boundary, 1, 1, 9500)
        self.assertEqual(report["status"], "available")
        self.assertEqual(len(report["remainingPath"]), 2)

        packet["replay"]["at_unix_ms"] = 12500
        report, _ = preview_frame(packet, zone, boundary, 2, 1, 9500)
        self.assertEqual(report["status"], "held")
        self.assertEqual(report["remainingPath"], [])
        self.assertEqual(report["routeRevision"], 1)

        packet["output_topic"] = "/cmd_vel"
        with self.assertRaises(ValueError):
            preview_frame(packet, zone, boundary, 3, 1, 9500)
