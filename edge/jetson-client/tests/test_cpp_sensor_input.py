import json
import math
import unittest

from jetson_mower_client.cpp_sensor_input import CppSensorInput


class CppSensorInputTest(unittest.TestCase):
    def setUp(self):
        self.inputs = CppSensorInput()
        self.inputs.readiness(True, 10)
        self.covariance = [.0009, 0, 0, 0, .0016, 0, 0, 0, 0]

    def sample(self, stamp, yaw, received):
        self.inputs.heading(stamp, (0, 0, math.sin(yaw / 2), math.cos(yaw / 2)), received)
        self.inputs.fix(stamp, 36.6, 127.4, self.covariance, 1, 0, received)

    def ready(self):
        self.sample(9_000_000_000, math.radians(179), 9)
        self.sample(10_000_000_000, math.radians(-179), 10)

    def test_pairs_measurement_time_and_wraps_rate_without_enabling_motion(self):
        self.ready()
        snap = {'schema': 'mower.obstacles.v1', 'work_zone_version': 4,
                'session_id': 'original', 'observation_unix_ms': 9500}
        self.inputs.snapshot(json.dumps(snap))
        event = self.inputs.event(10_100_000_000, 10.1)
        self.assertTrue(event['pose']['valid'])
        self.assertAlmostEqual(event['pose']['yaw_rate_radps'], math.radians(2))
        self.assertEqual(event['pose']['position_uncertainty_m'], .04)
        self.assertEqual(event['obstacle_snapshot'], snap)
        self.assertFalse(event['motion_preview_enabled'])
        self.assertFalse(event['cutting'])

    def test_missing_rate_different_stamp_and_stale_inputs_are_invalid(self):
        self.sample(10_000_000_000, 0, 10)
        self.assertEqual(self.inputs.event(10_100_000_000, 10.1)['adapter']['status'],
                         'heading_rate_unavailable')
        self.ready()
        self.assertFalse(self.inputs.event(10_500_000_001, 10.5)['pose']['valid'])
        self.assertFalse(self.inputs.event(9_999_999_999, 10)['pose']['valid'])
        self.inputs.fixes.clear()
        self.inputs.fix(10_010_000_000, 36, 127, self.covariance, 1, 0, 10)
        self.assertFalse(self.inputs.event(10_100_000_000, 10.1)['pose']['valid'])

    def test_duplicate_does_not_extend_receive_age_and_invalid_state_clears(self):
        self.ready()
        self.sample(10_000_000_000, math.radians(-179), 20)
        self.assertFalse(self.inputs.event(10_100_000_000, 20)['pose']['valid'])
        self.inputs.readiness(False, 20)
        self.assertFalse(self.inputs.fixes)
        self.assertFalse(self.inputs.headings)

    def test_unknown_covariance_bad_quaternion_and_uncertainty_are_rejected(self):
        self.ready()
        self.inputs.fix(10_000_000_000, 36, 127, self.covariance, 0, 0, 10)
        self.assertFalse(self.inputs.fixes)
        self.ready()
        self.inputs.heading(10_000_000_000, (0, 0, 0, 0), 10)
        self.assertFalse(self.inputs.headings)
        self.ready()
        self.inputs.fix(11_000_000_000, 36, 127, [1.] * 9, 1, 0, 11)
        self.inputs.heading(11_000_000_000, (0, 0, 0, 1), 11)
        self.assertEqual(self.inputs.event(11_100_000_000, 11.1)['adapter']['status'],
                         'position_uncertain')

    def test_snapshot_preserves_old_time_and_bad_message_withdraws_it(self):
        self.inputs.snapshot('{"schema":"mower.obstacles.v1","generated_at_unix_ms":1}')
        self.assertEqual(self.inputs.event(100, 10)['obstacle_snapshot']['generated_at_unix_ms'], 1)
        self.inputs.snapshot('{bad')
        self.assertEqual(self.inputs.event(100, 10)['obstacle_snapshot'], {})


if __name__ == '__main__':
    unittest.main()
