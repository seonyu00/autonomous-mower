import gzip
from datetime import datetime
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from uuid import uuid4

from jetson_mower_client.mission_upload import (
    GATEWAY_EXITED, GATEWAY_MANAGED, LOG_END_UNCONFIRMED, pack, queue_lifecycle, upload_pending,
)


class MissionUploadTest(unittest.TestCase):
    def make_session(self, folder: Path, *, permit=True, dry_run=False):
        source = folder / "session.test" / "mission-test" / "mission.jsonl"
        source.parent.mkdir(parents=True)
        zone = {"work_zone_id": "57", "work_zone_version": 3, "polygon": []}
        now = time.time_ns() // 1_000_000
        opening = {"type": "run_start", "schema": "mower.mission.log.v1", "dry_run": dry_run,
                   "work_zone": zone, "started_at_unix_ms": now - 2000}
        waiting = {"type": "step", "at_unix_ms": now - 1900, "input": {"decision_inputs": {"permit": False}}}
        active = {**waiting, "at_unix_ms": now - 1500, "input": {"decision_inputs": {"permit": permit}},
                  "actuator_command": {"output_topic": "/mower_cpp/drive_cmd_vel", "timestamp_unix_ms": now - 1499}}
        summary = {"ended_reason": "terminal_interrupted", "ended_at_unix_ms": now - 100,
                   "started_at_unix_ms": now - 2000, "dry_run": dry_run, "steps": 2}
        source.write_text("".join(json.dumps(row) + "\n" for row in
                                 (opening, waiting, active, {"type": "run_end", **summary})), encoding="utf-8")
        source.with_name("summary.json").write_text(json.dumps(summary), encoding="utf-8")
        (folder / "requested-work-zone.json").write_text(json.dumps(zone), encoding="utf-8")
        return source, active["at_unix_ms"], summary["ended_at_unix_ms"]

    def test_uploads_closed_managed_session_after_first_live_permit(self):
        with tempfile.TemporaryDirectory() as root:
            spool, run_id = Path(root), uuid4()
            folder = spool / str(run_id)
            source, start_at, end_at = self.make_session(folder)
            original = source.read_bytes()
            response = MagicMock()
            response.__enter__.return_value.status = 204
            with patch("jetson_mower_client.mission_upload.build_opener") as opener:
                send = opener.return_value.open
                send.side_effect = [response, HTTPError("https://test", 503, "retry", {}, None), response, response]
                for _ in range(3):
                    upload_pending(spool, "https://test", "TEST-01", "test-token")
                start, failed_end, end, replay = [record.args[0] for record in send.call_args_list]
                self.assertEqual(failed_end.data, end.data)
                self.assertEqual(json.loads(start.data)["kind"], "start")
                self.assertEqual(json.loads(end.data)["kind"], "end")
                for request, expected in ((start, start_at), (end, end_at)):
                    self.assertEqual(round(datetime.fromisoformat(json.loads(request.data)["signalAt"]).timestamp() * 1000),
                                     expected)
                self.assertEqual(json.loads(gzip.decompress(replay.data).splitlines()[0])["server_run_id"], str(run_id))
                self.assertEqual(source.read_bytes(), original)
                self.assertTrue((folder / ".uploaded").is_file())

    def test_gateway_session_waits_for_group_exit_then_closes_history_once(self):
        with tempfile.TemporaryDirectory() as root:
            spool, run_id = Path(root), uuid4()
            folder = spool / str(run_id)
            self.make_session(folder)
            (folder / GATEWAY_MANAGED).touch()
            with patch("jetson_mower_client.mission_upload.build_opener") as opener:
                send = opener.return_value.open
                send.return_value.__enter__.return_value.status = 204
                upload_pending(spool, "https://test", "TEST-01", "test-token")
                send.assert_not_called()
                (folder / GATEWAY_EXITED).touch()
                upload_pending(spool, "https://test", "TEST-01", "test-token")
                physical_end = {"runId": str(run_id), "id": str(uuid4()), "kind": "end",
                                "signalAt": "2026-11-24T12:00:00Z"}
                queue_lifecycle(spool, physical_end)
                upload_pending(spool, "https://test", "TEST-01", "test-token")
                self.assertEqual(send.call_count, 3)
                event = (folder / ".lifecycle-end.json").read_bytes()
                self.assertEqual(send.call_args_list[1].args[0].data, event)
                self.assertNotEqual(json.loads(event)["id"], physical_end["id"])
                self.assertFalse((folder / ".confirmed-end.json").exists())

    def test_gateway_session_exposes_unconfirmed_summary_without_sending_events(self):
        with tempfile.TemporaryDirectory() as root:
            spool = Path(root)
            folder = spool / str(uuid4())
            source, _, _ = self.make_session(folder)
            source.with_name("summary.json").write_text("{}")
            (folder / GATEWAY_MANAGED).touch()
            (folder / GATEWAY_EXITED).touch()
            with patch("jetson_mower_client.mission_upload.build_opener") as opener:
                upload_pending(spool, "https://test", "TEST-01", "test-token")
                opener.return_value.open.assert_not_called()
            self.assertTrue((folder / LOG_END_UNCONFIRMED).is_file())

    def test_skips_dry_unarmed_unclosed_and_mismatched_managed_sessions(self):
        cases = ("preview", "no permit", "no summary", "unclosed", "wrong zone", "wrong end")
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as root:
                spool = Path(root)
                folder = spool / str(uuid4())
                source, _, _ = self.make_session(folder, permit=case != "no permit", dry_run=case == "preview")
                if case == "no summary":
                    source.with_name("summary.json").unlink()
                if case == "unclosed":
                    source.write_bytes(b"\n".join(source.read_bytes().splitlines()[:-1]) + b"\n")
                if case == "wrong zone":
                    marker = folder / "requested-work-zone.json"
                    marker.write_text(marker.read_text().replace('"57"', '"58"'))
                if case == "wrong end":
                    source.with_name("summary.json").write_text("{}")
                with patch("jetson_mower_client.mission_upload.build_opener") as opener:
                    upload_pending(spool, "https://test", "TEST-01", "test-token")
                    opener.return_value.open.assert_not_called()
                self.assertEqual(list(folder.glob(".lifecycle-*.json")), [])

    def test_resends_end_with_same_signal_id_after_failure(self):
        with tempfile.TemporaryDirectory() as root:
            spool = Path(root)
            run = uuid4()
            signal = {"runId": str(run), "id": str(uuid4()), "kind": "start", "signalAt": "2026-11-22T09:00:00Z"}
            queue_lifecycle(spool, signal)
            queue_lifecycle(spool, {**signal, "id": str(uuid4())})
            queue_lifecycle(spool, {**signal, "id": str(uuid4()), "kind": "end", "signalAt": "2026-11-22T09:01:00Z"})
            response = MagicMock()
            response.__enter__.return_value.status = 204
            with patch("jetson_mower_client.mission_upload.build_opener") as opener:
                send = opener.return_value.open
                send.side_effect = [response, HTTPError("https://test", 503, "retry", {}, None), response]
                upload_pending(spool, "https://test", "TEST-01", "test-token")
                upload_pending(spool, "https://test", "TEST-01", "test-token")
                requests = [call.args[0] for call in send.call_args_list]
                self.assertEqual(len(requests), 3)
                self.assertEqual(json.loads(requests[0].data)["id"], signal["id"])
                self.assertEqual(json.loads(requests[1].data)["kind"], "end")
                self.assertEqual(requests[1].data, requests[2].data)

    def test_waits_for_end_retries_and_skips_confirmed_upload(self):
        with tempfile.TemporaryDirectory() as root:
            run_id = uuid4()
            spool = Path(root)
            folder = spool / str(run_id)
            mission = folder / "session.test" / "mission-test"
            mission.mkdir(parents=True)
            source = mission / "mission.jsonl"
            log = '{"type":"run_start","schema":"mower.mission.log.v1","dry_run":false}\n{"type":"step"}\n'
            source.write_text(log, encoding="utf-8")
            self.assertIsNone(pack(source, run_id))
            source.write_text(log + '{"type":"run_end"}\n', encoding="utf-8")
            (mission / "summary.json").write_text("{}", encoding="utf-8")
            response = MagicMock()
            response.__enter__.return_value.status = 204
            with patch("jetson_mower_client.mission_upload.build_opener") as opener:
                send = opener.return_value.open
                send.side_effect = [HTTPError("https://test", 409, "pending", {}, None), response]
                for _ in range(3):
                    upload_pending(spool, "https://test", "TEST-01", "test-token")
                self.assertEqual(send.call_count, 2)
                first, second = (record.args[0] for record in send.call_args_list)
                self.assertEqual(first.data, second.data)
                self.assertEqual(json.loads(gzip.decompress(first.data).splitlines()[0])["server_run_id"], str(run_id))
                self.assertTrue((folder / ".uploaded").is_file())
