import unittest

from jetson_mower_client.cpp_live_map import live_map_frame


class CppLiveMapTest(unittest.TestCase):
    def test_live_route_and_fresh_obstacles_share_the_active_zone(self):
        now = 1_800_000_000_000
        zone = {"work_zone_id": "3", "work_zone_version": 2}
        packet = {
            **zone, "planner": "edge", "output_topic": "/mower_cpp/drive_cmd_vel",
            "planning": {"status": "replanned", "remaining_path": [
                {"lon": 127, "lat": 37}, {"lon": 127.001, "lat": 37},
            ]},
            "replay": {"at_unix_ms": now - 10, "input": {"obstacle_snapshot": {
                **zone, "schema": "mower.obstacles.v1", "frame": "local_enu",
                "pose_valid": True, "observation_fresh": True,
                "generated_at_unix_ms": now - 20, "observation_unix_ms": now - 30,
                "origin_wgs84": {"lon": 127, "lat": 37},
                "dynamic_objects": [
                    {"class": "person", "visible": True, "last_seen_unix_ms": now - 30,
                     "position_m": {"east": 0, "north": 0}},
                    {"class": "person", "visible": False, "last_seen_unix_ms": now - 30},
                ],
                "static_objects": [
                    {"class": "tree", "visible": True, "last_seen_unix_ms": now - 35,
                     "region_m": [{"east": 0, "north": 0}, {"east": 1, "north": 0}, {"east": 1, "north": 1}]},
                ],
            }}},
        }
        frame = live_map_frame(packet, "run", (3, 2), now)
        self.assertEqual(frame["path"], [(127, 37), (127.001, 37)])
        self.assertEqual(frame["obstacles"][0], {"kind": "person", "position": (127, 37)})
        self.assertEqual(frame["obstacles"][1]["ring"][0], frame["obstacles"][1]["ring"][-1])
        self.assertIsNone(live_map_frame(packet, "run", (3, 1), now))
        self.assertIsNone(live_map_frame(packet, "run", (3, 2), now + 3000))
        self.assertIsNone(live_map_frame({**packet, "output_topic": None}, "run", (3, 2), now))
