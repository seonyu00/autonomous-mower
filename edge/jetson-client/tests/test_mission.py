import unittest
from unittest.mock import Mock
from jetson_mower_client.mission import Mission, ReviewedPlan


class MissionTest(unittest.TestCase):
    def test_stop_confirmation_then_regeneration_never_auto_resumes(self):
        stop = Mock()
        regenerate = Mock(return_value=ReviewedPlan('new',2,'b'*64))
        mission = Mission(stop,regenerate)
        mission.review(ReviewedPlan('old',1,'a'*64))
        execution = mission.request_auto(1)
        mission.file_prepared(execution,'old','a'*64)
        with self.assertRaises(ValueError): mission.confirm_started(execution,readiness_verified=False)
        mission.confirm_started(execution,readiness_verified=True)
        mission.zone_changed(2)
        self.assertEqual(mission.state,'stop-unconfirmed')
        regenerate.assert_not_called()
        with self.assertRaises(ValueError): mission.confirm_stopped('other',mission.stop_id)
        mission.confirm_stopped(execution,mission.stop_id)
        regenerate.assert_called_once_with(2)
        self.assertEqual(mission.state,'review-required')
        with self.assertRaises(ValueError): mission.request_auto(2)
        mission.review(mission.plan)
        self.assertEqual(mission.state,'plan-ready')

    def test_latest_version_wins_while_stopping_and_failed_plan_stays_stopped(self):
        regenerate=Mock(side_effect=ValueError('no route'))
        mission=Mission(Mock(),regenerate)
        mission.review(ReviewedPlan('old',1,'a'*64))
        execution=mission.request_auto(1)
        mission.zone_changed(2)
        stop_id=mission.stop_id
        mission.zone_changed(3)
        self.assertEqual(stop_id,mission.stop_id)
        with self.assertRaises(ValueError): mission.confirm_stopped(execution,stop_id)
        regenerate.assert_called_once_with(3)
        self.assertEqual(mission.state,'replan-failed')
        with self.assertRaises(ValueError): mission.request_auto(3)
