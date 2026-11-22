from unittest import TestCase
from unittest.mock import Mock, patch
from uuid import uuid4

from jetson_mower_client.preview_run import supervise


class PreviewRunTest(TestCase):
    def test_disconnect_terminates_process_and_old_ticket_does_not_restart(self):
        ticket = {"id": str(uuid4()), "zoneId": 2, "zoneVersion": 11}
        next_ticket = {**ticket, "id": str(uuid4())}
        poll = Mock(side_effect=[ticket, ticket, OSError("network"), ticket, next_ticket, None])
        first, second = Mock(), Mock()
        first.poll.return_value = second.poll.return_value = None
        launch = Mock(side_effect=[first, second])
        with patch("jetson_mower_client.preview_run.time.sleep"), patch(
            "jetson_mower_client.preview_run.stop_session"
        ) as stop:
            supervise(None, poll, launch, lambda: poll.call_count >= 6)
        self.assertEqual(launch.call_count, 2)
        self.assertEqual([call.args[0] for call in stop.call_args_list], [first, second])

    def test_expired_ticket_terminates_and_duplicate_poll_only_starts_once(self):
        ticket = {"id": str(uuid4()), "zoneId": 2, "zoneVersion": 11}
        proc = Mock()
        proc.poll.return_value = None
        launch = Mock(return_value=proc)
        poll = Mock(side_effect=[ticket, ticket, None])
        with patch("jetson_mower_client.preview_run.time.sleep"), patch(
            "jetson_mower_client.preview_run.stop_session"
        ) as stop:
            supervise(None, poll, launch, lambda: poll.call_count >= 3)
        self.assertEqual(launch.call_count, 1)
        stop.assert_called_once_with(proc)
