import io
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from jetson_mower_client import cpp_trial


class CppTrialTest(unittest.TestCase):
    def test_login_distinguishes_credentials_network_and_invalid_response_without_secrets(self):
        for error, message in ((HTTPError('https://example.test', 401, 'secret body', {}, None), '일치하지'),
                               (URLError('private detail'), '연결하지')):
            with patch('builtins.input', return_value='user'), \
                    patch.object(cpp_trial.getpass, 'getpass', return_value='private-password'), \
                    patch.object(cpp_trial, 'build_opener') as opener:
                opener.return_value.open.side_effect = error
                with self.assertRaises(ValueError) as result:
                    cpp_trial.login('https://example.test')
                self.assertIn(message, str(result.exception))
                self.assertNotIn('private', str(result.exception))
                self.assertNotIn('secret body', str(result.exception))
        with patch('builtins.input', return_value='user'), \
                patch.object(cpp_trial.getpass, 'getpass', return_value='private-password'), \
                patch.object(cpp_trial, 'build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value = io.StringIO('{"data":{}}')
            with self.assertRaisesRegex(ValueError, '응답 형식'):
                cpp_trial.login('https://example.test')

    def test_child_failure_cleans_only_owned_process_groups_and_uses_new_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            team_dir, observer = root / 'team', root / 'observer'
            team_dir.mkdir()
            observer.mkdir()
            for p in (team_dir / 'web_zone.py', team_dir / 'web_cpp.py', team_dir / 'drive_ros.py',
                      observer / 'recorder.py', root / 'model.onnx'):
                p.touch()
            zone = {'work_zone_id': '2', 'work_zone_version': 9}
            team = types.SimpleNamespace(current_zone=lambda *a: zone, work_plan=lambda z: z,
                                         WebCPP=MagicMock())
            children = [MagicMock(pid=n) for n in (101, 102, 103, 104)]
            children[0].poll.side_effect = [None, None]
            children[1].poll.side_effect = [1, None]
            children[2].poll.return_value = None
            children[2].stdout = io.BytesIO(b'')
            children[3].poll.return_value = None
            args = ['cpp_trial', '--api-base-url', 'https://example.test', '--team-dir', str(team_dir),
                    '--observer-dir', str(observer), '--model', str(root / 'model.onnx')]
            with patch.object(Path, 'home', return_value=root), patch.dict(os.environ, {'MOWER_READ_TOKEN': 'test'}), \
                    patch.object(cpp_trial.sys, 'argv', args), \
                    patch.object(cpp_trial.importlib, 'import_module', return_value=team), \
                    patch.object(cpp_trial, 'ThreadingHTTPServer'), \
                    patch.object(cpp_trial.subprocess, 'Popen', side_effect=children) as spawn, \
                    patch.object(cpp_trial.os, 'killpg', create=True) as kill:
                self.assertEqual(cpp_trial.main(), 1)
                calls = spawn.call_args_list
                self.assertEqual(len(calls), 4)
                recorder_args = calls[1].args[0]
                out = Path(recorder_args[recorder_args.index('--output') + 1])
                self.assertFalse(out.exists())
                self.assertEqual(out.parent.parent, root / 'cpp_trial_runs')
                self.assertIn('--work-plan', recorder_args)
                self.assertIn('--dual-gps', recorder_args)
                self.assertIn('--diagnostic-captures', recorder_args)
                self.assertNotIn('--rotation-trial', recorder_args)
                sensor_args = calls[2].args[0]
                self.assertIn('--jsonl-preview', sensor_args)
                self.assertNotIn('--enable-live-output', sensor_args)
                self.assertEqual({c.args[0] for c in kill.call_args_list}, {101, 102, 103, 104})

    def test_public_state_does_not_turn_missing_or_stale_input_into_fresh_measurements(self):
        event = {'pose': {'timestamp_unix_ms': 100, 'valid': False},
                 'obstacle_snapshot': {'observation_unix_ms': 100}}
        data = cpp_trial.public_state({'status': 'unavailable'}, event,
                                     {'planning': None}, 1)
        self.assertEqual(data['event'], event)
        self.assertEqual(data['received_at'], 1)
        self.assertIsNone(data['zone'])
        self.assertTrue(data['dry_run'])

    def test_resume_requires_fresh_valid_inputs_and_never_clears_safety_review(self):
        packet = {'received_at': 10., 'result': {'reason': 'near_guard_manual_resume_required',
                  'blocked_by': 'operator_resume'}, 'event': {
                  'pose': {'valid': True, 'yaw_ready': True}, 'obstacle_snapshot': {
                  'frame': 'local_enu', 'pose_valid': True, 'observation_fresh': True,
                  'near_guard': {'status': 'no_obstacle_detected', 'capture_unix_ms': 10000}}}}
        self.assertTrue(cpp_trial.can_resume(packet, 10.1))
        self.assertFalse(cpp_trial.can_resume(packet, 10.6))
        packet['result']['safety_review_id'] = 'review-1'
        self.assertFalse(cpp_trial.can_resume(packet, 10.1))
        packet['result'].pop('safety_review_id')
        packet['event']['obstacle_snapshot']['near_guard']['status'] = 'stop_requested'
        self.assertFalse(cpp_trial.can_resume(packet, 10.1))


if __name__ == '__main__':
    unittest.main()
