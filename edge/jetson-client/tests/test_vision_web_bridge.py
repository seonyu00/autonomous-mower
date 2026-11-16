import unittest

from jetson_mower_client.vision_web_bridge import observation_plan, observation_batch
from jetson_mower_client.web_work_zone import prepare


def zone():
    return prepare({'success': True, 'data': {'robotId': 'A', 'zoneId': 1, 'version': 2,
        'zone': {'type': 'Polygon', 'srid': 4326, 'geometry': {'type': 'Polygon',
            'coordinates': [[[127, 37], [127.0001, 37], [127.0001, 37.00005],
                             [127.00005, 37.00005], [127.00005, 37.0001], [127, 37.0001], [127, 37]]]}}}}, 'A', 2)


class VisionWebBridgeTest(unittest.TestCase):
    def test_concave_polygon_has_excluded_cells(self):
        plan = observation_plan(zone())
        self.assertIn(0, {x for row in plan['grid'] for x in row})
        self.assertIn(1, {x for row in plan['grid'] for x in row})
        self.assertEqual(plan['work_zone_version'], '2')

    def test_large_area_rejected(self):
        prepared = zone()
        prepared['zone']['geometry']['coordinates'] = [[[127, 37], [128, 37], [128, 38], [127, 38], [127, 37]]]
        with self.assertRaises(ValueError):
            observation_plan(prepared)

    def state(self):
        prepared = zone()
        return {'status': {'state': 'pose_ready', 'yaw_ready': True,
                'heading_source': 'dual_gps_fixed_baseline', 'zoneVersion': 2,
                'zoneSha256': prepared['zoneSha256'], 'sessionId': 'test-session'},
                'sensor_age_s': {'gps': .1, 'odom': .1, 'imu': .1},
                'map': {'origin': {'lon': 127, 'lat': 37}},
                'last_map_result': {'status': 'ok', 'work_zone_version': '2',
                    'capture_timestamp_ns': 1_000_000_000,
                    'current_observations': [
                        {'label': 'person', 'status': 'localized', 'center_gps': {'lon': 127.00001, 'lat': 37.00001}},
                        {'label': 'bush', 'status': 'localized', 'region_enu_m': [
                            {'east': 1, 'north': 1}, {'east': 2, 'north': 1},
                            {'east': 2, 'north': 2}, {'east': 1, 'north': 2}]}]}}

    def test_person_and_candidate_keep_distinct_payloads_and_stable_ids(self):
        batch = observation_batch(self.state(), zone(), 1.5)
        self.assertEqual([o['objectType'] for o in batch['observations']], ['PERSON', 'BUSH_CANDIDATE'])
        self.assertEqual(batch, observation_batch(self.state(), zone(), 1.5))

    def test_stale_invalid_and_wrong_zone_never_forward(self):
        for changes in ({'zoneVersion': 3}, {'zoneSha256': 'wrong'}, {'yaw_ready': False}):
            state = self.state()
            state['status'].update(changes)
            self.assertIsNone(observation_batch(state, zone(), 1.5))
        self.assertIsNone(observation_batch(self.state(), zone(), 4))
        state = self.state()
        state['sensor_age_s']['gps'] = 3
        self.assertIsNone(observation_batch(state, zone(), 1.5))

    def test_outside_observation_not_sent(self):
        state = self.state()
        state['last_map_result']['current_observations'] = [
            {'label': 'person', 'status': 'localized', 'center_gps': {'lon': 128, 'lat': 38}}]
        self.assertIsNone(observation_batch(state, zone(), 1.5))

    def test_oversized_frame_is_not_silently_truncated(self):
        state = self.state()
        state['last_map_result']['current_observations'] *= 11
        with self.assertRaises(ValueError):
            observation_batch(state, zone(), 1.5)
