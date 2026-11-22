import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from test_web_work_zone import response
from jetson_mower_client.autonomy_zone import main, stage_zone


class AutonomyZoneTest(unittest.TestCase):
    def test_fetches_current_version_and_writes_only_matching_zone(self):
        body = response()
        ring = [[127, 36], [127.0002, 36], [127.0002, 36.0002], [127, 36.0002], [127, 36]]
        body["data"]["zone"]["geometry"]["coordinates"] = [ring]
        with tempfile.TemporaryDirectory() as tmp, patch(
                "jetson_mower_client.autonomy_zone.fetch", return_value=body) as fetch:
            directory = Path(tmp) / "run"
            for zone_id, version in ((10, 3), (9, 2)):
                with self.assertRaises(ValueError):
                    stage_zone("https://example.invalid", "test-only", "test-robot", zone_id, version, directory)
                self.assertFalse(directory.exists())
            file = stage_zone("https://example.invalid", "test-only", "test-robot", 9, 3, directory)
            fetch.assert_called_with("https://example.invalid", "test-robot", "test-only")
            self.assertEqual(json.loads(file.read_text()), {
                "work_zone_id": "9", "work_zone_version": 3,
                "polygon": [{"lat": lat, "lon": lon} for lon, lat in ring[:-1]],
            })

    def test_only_passes_staged_file_to_configured_runner(self):
        run_id = str(uuid4())
        folder = Path.cwd() / run_id
        runner = str(Path.cwd() / "test-runner")
        target = folder / "requested-work-zone.json"
        with patch.dict(os.environ, {"MOWER_RUN_ID": run_id, "MOWER_PREVIEW_LOG_DIR": str(folder),
                                    "WORK_ZONE_API_TOKEN": "test-only"}), \
                patch("sys.argv", ["autonomy_zone", "test-robot", "2", "11", runner, "--option"]), \
                patch("jetson_mower_client.autonomy_zone.stage_zone", return_value=target) as stage, \
                patch("jetson_mower_client.autonomy_zone.os.execv") as execute:
            main()
            execute.assert_called_once_with(runner, [runner, "--option", str(target)])
            self.assertNotIn("WORK_ZONE_API_TOKEN", os.environ)
            execute.reset_mock()
            stage.side_effect = ValueError("zone changed")
            with self.assertRaises(SystemExit):
                main()
            execute.assert_not_called()

    def test_replaces_zone_placeholder_at_its_declared_position(self):
        run_id = str(uuid4())
        folder = Path.cwd() / run_id
        runner = str(Path.cwd() / "test-runner")
        target = folder / "requested-work-zone.json"
        with patch.dict(os.environ, {"MOWER_RUN_ID": run_id, "MOWER_PREVIEW_LOG_DIR": str(folder),
                                    "WORK_ZONE_API_TOKEN": "test-only"}), \
                patch("sys.argv", ["autonomy_zone", "test-robot", "2", "11", runner, "--live", "{work-zone}", "--port"]), \
                patch("jetson_mower_client.autonomy_zone.stage_zone", return_value=target), \
                patch("jetson_mower_client.autonomy_zone.os.execv") as execute:
            main()
            execute.assert_called_once_with(runner, [runner, "--live", str(target), "--port"])
