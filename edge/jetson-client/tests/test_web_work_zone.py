import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from jetson_mower_client.web_work_zone import NoRedirect, fetch, prepare, save_new


def response():
    # 오목한 외곽과 내부 제외 구역을 함께 보존해야 한다.
    return {"success": True, "data": {"robotId": "test-robot", "zoneId": 9, "version": 3,
        "updatedAt": "2026-11-07T00:00:00", "zone": {"type": "Polygon", "srid": 4326,
        "geometry": {"type": "Polygon", "coordinates": [
            [[127, 36], [127.01, 36], [127.01, 36.005], [127.005, 36.005], [127.005, 36.01], [127, 36.01], [127, 36]],
            [[127.001, 36.001], [127.002, 36.001], [127.002, 36.002], [127.001, 36.002], [127.001, 36.001]],
        ]}}}}


class WebWorkZoneTest(unittest.TestCase):
    def test_polygon_holes_identity_and_coordinates_are_preserved(self):
        original = response()
        result = prepare(original, "test-robot", 3)
        self.assertEqual(result["zone"], original["data"]["zone"])
        self.assertEqual((result["robotId"], result["zoneId"], result["version"]), ("test-robot", 9, 3))
        self.assertEqual(result["status"], "prepared")
        self.assertEqual(len(result["zoneSha256"]), 64)
        self.assertEqual(result["zoneSha256"], prepare(original, "test-robot", 3)["zoneSha256"])
        result["zone"]["geometry"]["coordinates"][0][0][0] = 128
        self.assertEqual(original["data"]["zone"]["geometry"]["coordinates"][0][0][0], 127)

    def test_mismatched_robot_and_version_are_rejected(self):
        for robot, version in [("other", 3), ("test-robot", 2)]:
            with self.assertRaises(ValueError):
                prepare(response(), robot, version)

    def test_invalid_shapes_and_nonfinite_coordinates_are_rejected(self):
        cases = [[], [[[127,36],[128,36],[128,37]]],
                 [[[127,36],[128,37],[127,37],[128,36],[127,36]]],
                 [[[127,36],[128,36],[128,37],[float("nan"),37],[127,36]]],
                 [[[127,36],[128,36],[128,37],[127,37],[127,36]],
                  [[130,36],[131,36],[131,37],[130,37],[130,36]]]]
        for coordinates in cases:
            data = response()
            data["data"]["zone"]["geometry"]["coordinates"] = coordinates
            with self.assertRaises(ValueError):
                prepare(data, "test-robot", 3)

    def test_error_response_wrong_srid_and_boolean_numbers_are_rejected(self):
        cases = []
        for path, value in [(('success',), False), (('data','zone','srid'), 3857), (('data','version'), True)]:
            data = response()
            target = data
            for key in path[:-1]: target = target[key]
            target[path[-1]] = value
            cases.append(data)
        data = response(); data['data']['zone']['geometry']['coordinates'][0][1][0] = True; cases.append(data)
        for data in cases:
            with self.assertRaises(ValueError): prepare(data, "test-robot", 3)

    def test_existing_files_and_test_boundary_name_are_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old = root / "prepared.json"; old.write_text("unchanged")
            with self.assertRaises(FileExistsError): save_new(old, prepare(response(), "test-robot", 3))
            self.assertEqual(old.read_text(), "unchanged")
            with self.assertRaises(ValueError): save_new(root / "boundary.json", prepare(response(), "test-robot", 3))
            fresh = root / "web-zone-v3.json"
            save_new(fresh, prepare(response(), "test-robot", 3))
            self.assertEqual(json.loads(fresh.read_text(encoding="utf-8"))["version"], 3)

    def test_authenticated_get_uses_existing_api_and_refuses_redirects(self):
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = json.dumps(response()).encode()
        with patch("jetson_mower_client.web_work_zone.build_opener", return_value=opener):
            self.assertEqual(fetch("https://example.invalid", "test/robot", "test-only-token"), response())
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://example.invalid/api/robots/test%2Frobot/work-zone")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-only-token")
        self.assertIsNone(NoRedirect().redirect_request(None,None,302,None,None,"https://other.invalid"))
        for url in ["http://example.invalid", "https://user:pass@example.invalid", "https://example.invalid?token=x"]:
            with self.assertRaises(ValueError): fetch(url, "test", "test-only-token")

    def test_offline_cli_creates_only_separate_preparation_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "response.json"; source.write_text(json.dumps(response()), encoding="utf-8")
            output = root / "web-zone-v3.json"
            command = [sys.executable, "-m", "jetson_mower_client.web_work_zone", "--response-file", str(source),
                       "--robot-id", "test-robot", "--expected-version", "3", "--output", str(output)]
            result = subprocess.run(command, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["status"], "prepared")
            self.assertEqual(subprocess.run(command, capture_output=True, timeout=10).returncode, 1)
            self.assertEqual(set(p.name for p in root.iterdir()), {"response.json", "web-zone-v3.json"})
