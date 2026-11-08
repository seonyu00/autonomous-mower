import copy
import hashlib
import json
import unittest
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from test_web_work_zone import response
from jetson_mower_client.web_route_plan import prepare_route
from jetson_mower_client.web_work_zone import fetch

PLAN_ID = "11111111-1111-4111-8111-111111111111"


def envelope(data=None):
    if data is None:
        data = {"formatVersion": 1, "plannerProfile": "hd7000w-v1", "workZone": response()["data"],
                "preview": {"robotId": "test-robot", "zoneId": 9, "version": 3, "cellSizeM": .2,
                            "path": [{"lat": 36.003, "lon": 127.003}, {"lat": 36.004, "lon": 127.004}]}}
    payload = json.dumps(data, ensure_ascii=False)
    return {"success": True, "data": {"planId": PLAN_ID, "payload": payload,
            "sha256": hashlib.sha256(payload.encode()).hexdigest()}}


class WebRoutePlanTest(unittest.TestCase):
    def test_entry_route_requires_travel_polygon_and_connected_endpoint(self):
        data = json.loads(envelope()["data"]["payload"])
        data.update(formatVersion=2, plannerProfile="hd7000w-transit-v1")
        data["workZone"]["travelZone"] = {"type":"Polygon","srid":4326,"geometry":{"type":"Polygon","coordinates":[[
            [126.995,35.995],[127.015,35.995],[127.015,36.015],[126.995,36.015],[126.995,35.995]]]}}
        data["preview"]["transitPath"] = [{"lat":36.003,"lon":126.999},data["preview"]["path"][0]]
        prepared=prepare_route(envelope(data),"test-robot",3,PLAN_ID)
        self.assertEqual(json.loads(prepared["payload"])["preview"]["transitPath"],data["preview"]["transitPath"])
        data["preview"]["transitPath"][-1] = {"lat":36.004,"lon":127.004}
        with self.assertRaises(ValueError): prepare_route(envelope(data),"test-robot",3,PLAN_ID)
    def test_authenticated_plan_get_and_offline_cli(self):
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = json.dumps(envelope()).encode()
        with patch("jetson_mower_client.web_work_zone.build_opener", return_value=opener):
            fetch("https://example.invalid", "test-robot", "test-only-token", PLAN_ID)
        self.assertTrue(opener.open.call_args.args[0].full_url.endswith("/work-zone/cpp-preview/plans/" + PLAN_ID))
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "input.json", Path(directory) / "web-route.json"
            source.write_text(json.dumps(envelope()), encoding="utf-8")
            command = [sys.executable, "-m", "jetson_mower_client.web_route_plan", "--response-file", str(source),
                       "--robot-id", "test-robot", "--expected-version", "3", "--plan-id", PLAN_ID, "--output", str(output)]
            subprocess.run(command, check=True, capture_output=True)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["payload"], envelope()["data"]["payload"])
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
    def test_preserves_exact_bytes_and_coordinates(self):
        source = envelope()
        prepared = prepare_route(source, "test-robot", 3, PLAN_ID)
        self.assertEqual(prepared["payload"], source["data"]["payload"])
        self.assertEqual(prepared["sha256"], source["data"]["sha256"])
        self.assertEqual(prepared["status"], "route_prepared")

    def test_tampering_robot_version_and_plan_id_are_rejected(self):
        bad = copy.deepcopy(envelope())
        bad["data"]["payload"] += " "
        for source, robot, version, plan_id in [(bad, "test-robot", 3, PLAN_ID),
                (envelope(), "other", 3, PLAN_ID), (envelope(), "test-robot", 4, PLAN_ID),
                (envelope(), "test-robot", 3, "22222222-2222-4222-8222-222222222222")]:
            with self.assertRaises(ValueError):
                prepare_route(source, robot, version, plan_id)

    def test_invalid_and_boundary_crossing_paths_are_rejected(self):
        data = json.loads(envelope()["data"]["payload"])
        for path in [[], [{"lat": 36.003, "lon": 127.003}],
                [{"lat": 36.009, "lon": 127.009}, {"lat": 36.008, "lon": 127.008}],
                [{"lat": 36.0015, "lon": 127.0005}, {"lat": 36.0015, "lon": 127.003}],
                [{"lat": 36.000001, "lon": 127.003}, {"lat": 36.000001, "lon": 127.004}]]:
            data["preview"]["path"] = path
            with self.assertRaises(ValueError):
                prepare_route(envelope(data), "test-robot", 3, PLAN_ID)


if __name__ == "__main__":
    unittest.main()
