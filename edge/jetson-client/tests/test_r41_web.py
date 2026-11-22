import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from shapely.geometry import Polygon

from jetson_mower_client.r41_web import (
    local_zone, observation_batch, replay_observations, replay_preview_routes, save_zone_file, wgs84_point,
)
from jetson_mower_client.web_work_zone import prepare


STAMP = 1_700_000_000_000
RING = [[127.454, 36.6255], [127.455, 36.6255], [127.455, 36.626],
        [127.4545, 36.626], [127.4545, 36.6265], [127.454, 36.6265], [127.454, 36.6255]]


def response(rings=None):
    return {"success": True, "data": {
        "robotId": "MOWER-01", "zoneId": 2, "version": 11,
        "zone": {"type": "Polygon", "srid": 4326,
                 "geometry": {"type": "Polygon", "coordinates": [RING] if rings is None else rings}},
    }}


def snapshot(stamp=STAMP):
    return {"schema": "mower.obstacles.v1", "session_id": "r41-synthetic",
            "generated_at_unix_ms": stamp + 10, "observation_unix_ms": stamp,
            "frame": "local_enu", "origin_wgs84": {"lon": 127.4542, "lat": 36.6257},
            "pose_valid": True, "observation_fresh": True, "work_zone_id": "2",
            "work_zone_version": 11,
            "dynamic_objects": [{"id": "p1", "class": "person", "visible": True,
                                 "last_seen_unix_ms": stamp, "position_m": {"east": 2, "north": 1}}],
            "static_objects": [{"id": "b1", "class": "bush", "visible": True,
                                "last_seen_unix_ms": stamp,
                                "region_m": [{"east": 4, "north": 3}, {"east": 5, "north": 3},
                                             {"east": 5, "north": 4}, {"east": 4, "north": 4}],
                                "safety_region_m": [{"east": -99, "north": -99}]}]}


class R41WebTest(unittest.TestCase):
    def setUp(self):
        self.zone = local_zone(prepare(response(), "MOWER-01", 11))
        self.boundary = Polygon([wgs84_point(point) for point in self.zone["polygon"]])

    def batch(self, value, reference=STAMP + 100):
        return observation_batch(value, self.zone, self.boundary, reference)

    def test_zone_preserves_order_and_concavity_and_drops_closing_point(self):
        self.assertEqual(self.zone, {
            "work_zone_id": "2", "work_zone_version": 11,
            "polygon": [{"lat": lat, "lon": lon} for lon, lat in RING[:-1]],
        })

    def test_wrong_robot_version_swapped_axes_and_hole_are_rejected(self):
        with self.assertRaises(ValueError):
            prepare(response(), "OTHER", 11)
        with self.assertRaises(ValueError):
            prepare(response(), "MOWER-01", 12)
        with self.assertRaises(ValueError):
            prepare(response([[[lat, lon] for lon, lat in RING]]), "MOWER-01", 11)
        hole = [[127.4541, 36.6256], [127.4542, 36.6256], [127.4542, 36.6257],
                [127.4541, 36.6257], [127.4541, 36.6256]]
        with self.assertRaisesRegex(ValueError, "내부 제외"):
            local_zone(prepare(response([RING, hole]), "MOWER-01", 11))

    def test_atomic_zone_export_never_replaces_existing_file(self):
        with tempfile.TemporaryDirectory() as work:
            path = Path(work, "r41-zone.json")
            save_zone_file(path, self.zone)
            with self.assertRaises(FileExistsError):
                save_zone_file(path, {"version": 12})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), self.zone)
            self.assertEqual(list(Path(work).iterdir()), [path])

    def test_converts_people_and_candidates_using_raw_region_and_axis_order(self):
        value = snapshot()
        tree = dict(value["static_objects"][0], id="t1", **{"class": "tree"})
        value["static_objects"].append(tree)
        batch = self.batch(value)
        by_kind = {item["objectType"]: item for item in batch["observations"]}
        person = by_kind["PERSON"]
        self.assertAlmostEqual(person["longitude"], 127.45422238, places=7)
        self.assertAlmostEqual(person["latitude"], 36.62570898, places=7)
        self.assertEqual(person["observedAt"], "2023-11-14T22:13:20+00:00")
        for kind in ("TREE_CANDIDATE", "BUSH_CANDIDATE"):
            ring = by_kind[kind]["area"]["geometry"]["coordinates"][0]
            self.assertEqual(ring[0], ring[-1])
            self.assertGreater(ring[0][0], value["origin_wgs84"]["lon"])
            self.assertGreater(ring[0][1], value["origin_wgs84"]["lat"])
            self.assertEqual(len(ring), 5)

    def test_actual_seen_at_is_stable_across_snapshots_and_moves_get_a_new_id(self):
        first = snapshot()
        first["session_id"] = "a" * 64
        next_frame = copy.deepcopy(first)
        next_frame.update(generated_at_unix_ms=STAMP + 400, observation_unix_ms=STAMP + 300)
        old = self.batch(first)
        self.assertEqual(self.batch(next_frame, STAMP + 401), old)
        person = next_frame["dynamic_objects"][0]
        person.update(last_seen_unix_ms=STAMP + 300, position_m={"east": 3, "north": 1})
        moved = self.batch(next_frame, STAMP + 401)
        self.assertNotEqual(moved["observations"][-1]["observationId"], old["observations"][-1]["observationId"])
        for item in moved["observations"]:
            self.assertLessEqual(len(f'{moved["sessionId"]}:{item["observationId"]}'), 128)

    def test_dropped_invalid_stale_invisible_or_out_of_zone_input(self):
        for change in ({"pose_valid": False}, {"observation_fresh": False}, {"frame": "unavailable"}):
            self.assertIsNone(self.batch(dict(snapshot(), **change)))
        self.assertIsNone(self.batch(snapshot(), STAMP + 5))
        self.assertIsNone(self.batch(snapshot(), STAMP + 3000))
        value = snapshot()
        value["dynamic_objects"][0]["visible"] = False
        value["static_objects"][0]["region_m"] = [
            {"east": 200, "north": 200}, {"east": 201, "north": 200}, {"east": 201, "north": 201}]
        self.assertIsNone(self.batch(value))
        with self.assertRaisesRegex(ValueError, "ID·버전"):
            self.batch(dict(value, work_zone_version=10))

    def test_rejects_conflicting_identity_bad_geometry_or_oversized_batch(self):
        value = snapshot()
        value["dynamic_objects"] *= 2
        value["dynamic_objects"][1] = dict(value["dynamic_objects"][0], position_m={"east": 3, "north": 1})
        with self.assertRaisesRegex(ValueError, "다른 내용"):
            self.batch(value)
        value = snapshot()
        value["static_objects"][0]["region_m"] = [{"east": 1, "north": 1}] * 3
        with self.assertRaisesRegex(ValueError, "다각형"):
            self.batch(value)
        value = snapshot()
        person = value["dynamic_objects"][0]
        value["dynamic_objects"] = [dict(person, id=i) for i in range(20)]
        with self.assertRaisesRegex(ValueError, "20개"):
            self.batch(value)

    def test_replay_preserves_original_capture_and_indicates_invalid_line(self):
        original = json.dumps(snapshot())
        replayed = list(replay_observations([original, "\n", original], self.zone))
        self.assertEqual(replayed, [self.batch(snapshot())] * 2)
        with self.assertRaisesRegex(ValueError, "3행"):
            list(replay_observations([original, "\n", "{broken}"], self.zone))

    def test_cli_reads_saved_response_and_writes_existing_api_batch_jsonl(self):
        with tempfile.TemporaryDirectory() as work:
            zone_response = Path(work, "work-zone-response.json")
            zone_response.write_text(json.dumps(response()), encoding="utf-8")
            obstacles = Path(work, "obstacles.jsonl")
            obstacles.write_text(json.dumps(snapshot()) + "\n", encoding="utf-8")
            command = [sys.executable, "-m", "jetson_mower_client.r41_web", "replay-obstacles",
                       "--response-file", str(zone_response), "--obstacles", str(obstacles),
                       "--robot-id", "MOWER-01", "--expected-version", "11"]
            output = subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8")
            result = json.loads(output.stdout)
            self.assertEqual(result, json.loads(json.dumps(self.batch(snapshot()))))

    def test_preview_route_replaces_revision_and_clears_on_hold_or_missing_new_revision(self):
        def packet(offset, status, rev, **planning):
            at = (STAMP + 100 + offset) / 1000
            return {"dry_run": True, "zone": self.zone, "generated_at": at, "received_at": at,
                    "event": {"pose": {"valid": True, "yaw_ready": True}, "obstacle_snapshot": snapshot()},
                    "result": {"status": status, "planning": {"route_revision": rev, **planning}}}

        path_1 = self.zone["polygon"][:2]
        path_2 = self.zone["polygon"][2:4]
        lines = [packet(0, "replanned", 1, remaining_path=path_1),
                 packet(10, "unchanged", 1),
                 packet(20, "unchanged", 2),
                 packet(30, "replanned", 2, remaining_path=path_2),
                 packet(15, "unchanged", 1, remaining_path=path_1),
                 packet(40, "sensor_hold", 2), packet(50, "unchanged", 2),
                 packet(60, "unchanged", 2, remaining_path=path_2),
                 packet(3000, "unchanged", 2)]
        routes = list(replay_preview_routes(map(json.dumps, lines), self.zone))
        self.assertEqual([route["remainingPath"] for route in routes],
                         [path_1, path_1, [], path_2, [], [], path_2, []])
        self.assertEqual(routes[2]["routeRevision"], 2)
        self.assertEqual(routes[-1]["reason"], "preview_inputs_unavailable")

    def test_preview_route_rejects_non_preview_and_session_change(self):
        first = {"dry_run": True, "zone": self.zone, "generated_at": STAMP / 1000,
                 "event": {"obstacle_snapshot": snapshot()}}
        later = copy.deepcopy(first)
        later["generated_at"] += 1
        later["event"]["obstacle_snapshot"]["session_id"] = "different"
        with self.assertRaisesRegex(ValueError, "별도의 JSONL"):
            list(replay_preview_routes(map(json.dumps, [first, later]), self.zone))
        with self.assertRaisesRegex(ValueError, "무구동"):
            list(replay_preview_routes([json.dumps(dict(first, dry_run=False))], self.zone))


if __name__ == "__main__":
    unittest.main()
