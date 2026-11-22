import json
import unittest

from test_web_route_plan import PLAN_ID, envelope
from jetson_mower_client.cpp_auto_preflight import inspect
from jetson_mower_client.r41_web import local_zone
from jetson_mower_client.web_work_zone import prepare


class AutoPreflightTest(unittest.TestCase):
    def test_fresh_observation_has_no_drive_authority_and_stale_status_is_rejected(self):
        data = json.loads(envelope()["data"]["payload"])
        work_zone = data["workZone"]
        work_zone["zone"]["geometry"]["coordinates"] = work_zone["zone"]["geometry"]["coordinates"][:1]
        response = envelope(data)
        zone = local_zone(prepare({"success": True, "data": work_zone}, "test-robot", 3))
        pose = {"valid": True, "yaw_ready": True, "timestamp_unix_ms": 9900, "yaw_timestamp_unix_ms": 9950,
                "position_uncertainty_m": .02, "lat": 36.003, "lon": 127.003}
        snapshot = {**zone, "schema": "mower.obstacles.v1", "frame": "local_enu",
                    "pose_valid": True, "observation_fresh": True,
                    "observation_unix_ms": 9800, "generated_at_unix_ms": 9900}
        source = {**zone, "at_unix_ms": 10000, "command_at_unix_ms": None,
                  "input": {"pose": pose, "obstacle_snapshot": snapshot}}
        packet = {**zone, "output_topic": None, "planner": "edge", "armed": False, "v": 0, "w": 0, "replay": source}
        path = data["preview"]["path"]
        packet["planning"] = {"status": "replanned", "route_revision": 1, "remaining_path": path}
        result = inspect(response, "test-robot", 3, PLAN_ID, zone, packet, 10050)
        self.assertTrue(result["poseUsableForPreview"])
        self.assertTrue(result["obstaclesFresh"])
        self.assertIn("local_drive_authority", result["unconfirmed"])
        self.assertIn("reviewed_plan_applied_by_runner", result["unconfirmed"])
        self.assertEqual(result["initialPathComparison"], "match")
        packet["planning"]["remaining_path"] = list(reversed(path))
        different = inspect(response, "test-robot", 3, PLAN_ID, zone, packet, 10050)
        self.assertEqual(different["initialPathComparison"], "different")
        stale = inspect(response, "test-robot", 3, PLAN_ID, zone, packet, 10501)
        self.assertFalse(stale["poseUsableForPreview"])
        self.assertFalse(stale["obstaclesFresh"])
        self.assertEqual(stale["initialPathComparison"], "unavailable")
        with self.assertRaises(ValueError):
            inspect(response, "test-robot", 3, PLAN_ID, {**zone, "work_zone_version": 4}, packet, 10050)
        with self.assertRaises(ValueError):
            inspect(response, "test-robot", 3, PLAN_ID, zone, {**packet, "output_topic": "/cmd_vel"}, 10050)
