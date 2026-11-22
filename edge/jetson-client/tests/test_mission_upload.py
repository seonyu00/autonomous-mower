import gzip
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from uuid import uuid4

from jetson_mower_client.mission_upload import pack, queue_lifecycle, upload_pending


class MissionUploadTest(unittest.TestCase):
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
