import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from test_web_route_plan import PLAN_ID, envelope
from jetson_mower_client.web_route_plan import prepare_route
from jetson_mower_client.web_route_report import report_prepared


class WebRouteReportTest(unittest.TestCase):
    def test_report_and_retry_preserve_file_and_send_only_hash(self):
        prepared = prepare_route(envelope(), 'test-robot', 3, PLAN_ID)
        reply = {'success': True, 'data': {'planId': PLAN_ID, 'sha256': prepared['sha256'],
                 'reported': True, 'receivedAt': '2026-11-07T12:00:00Z'}}
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = json.dumps(reply).encode()
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'route.json'
            file.write_text(json.dumps(prepared), encoding='utf-8')
            original = file.read_bytes()
            with patch('jetson_mower_client.web_route_report.fetch', return_value=envelope()), patch('jetson_mower_client.web_route_report.build_opener', return_value=opener):
                for _ in range(2):
                    result = report_prepared('https://example.invalid', 'test-robot', 3, PLAN_ID, file, 'test-only-token')
                    self.assertEqual(result, reply['data'])
                request = opener.open.call_args.args[0]
                self.assertEqual(request.method, 'POST')
                self.assertEqual(json.loads(request.data), {'sha256': prepared['sha256']})
                self.assertTrue(request.full_url.endswith('/' + PLAN_ID + '/preparation'))
                opener.open.side_effect = HTTPError(request.full_url, 403, 'forbidden', None, None)
                with self.assertRaises(ValueError):
                    report_prepared('https://example.invalid', 'test-robot', 3, PLAN_ID, file, 'test-only-token')
            self.assertEqual(file.read_bytes(), original)

    def test_invalid_file_or_stale_server_never_posts(self):
        prepared = prepare_route(envelope(), 'test-robot', 3, PLAN_ID)
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'route.json'
            bad = copy.deepcopy(prepared)
            bad['payload'] += ' '
            with patch('jetson_mower_client.web_route_report.build_opener') as opener:
                file.write_text(json.dumps(bad), encoding='utf-8')
                with self.assertRaises(ValueError):
                    report_prepared('https://example.invalid', 'test-robot', 3, PLAN_ID, file, 'test-only-token')
                file.write_text(json.dumps(prepared), encoding='utf-8')
                with patch('jetson_mower_client.web_route_report.fetch', side_effect=ValueError('stale')):
                    with self.assertRaises(ValueError):
                        report_prepared('https://example.invalid', 'test-robot', 3, PLAN_ID, file, 'test-only-token')
                opener.assert_not_called()
