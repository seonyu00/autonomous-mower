import unittest
from unittest.mock import Mock

from jetson_mower_client.manual_serial_session import ManualSerialSession
from jetson_mower_client.manual_serial_protocol import encode_packet
from test_manual_serial_bridge import SerialStub


class Port(SerialStub):
    def __init__(self):
        super().__init__()
        self.closed = False

    def close(self):
        self.closed = True


class ManualSerialSessionTest(unittest.TestCase):
    def ready(self):
        port = Port()
        opener = Mock(return_value=port)
        session = ManualSerialSession("/dev/test", opener)
        opener.assert_not_called()
        session.prepare(0)
        session.tick(0)
        session.tick(0.1)
        port.incoming.extend(b"Remote active: 0 (hold remaining=0ms)\n")
        session.tick(0.2)
        return session, port

    def test_only_explicit_prepare_opens_port_and_readiness_never_moves(self):
        session, port = self.ready()
        self.assertEqual(session.phase, "ready")
        self.assertFalse(session.armed)
        self.assertTrue(all(packet == encode_packet(0, 1500, 1500) for packet in port.sent))
        self.assertTrue(session.arm("arm", 0.3))
        self.assertTrue(session.command("arm", "press", "forward", 0.5, 0.31))
        session.tick(0.32)
        self.assertEqual(port.sent[-1], encode_packet(1, 1600, 1600))
        session.tick(0.7)
        self.assertTrue(port.closed)
        self.assertFalse(session.armed)

    def test_cancel_or_timeout_closes_port_and_cannot_rearm(self):
        for timeout in (False, True):
            session, port = self.ready()
            if timeout:
                session.tick(2.3)
            else:
                session.disarm()
            self.assertTrue(port.closed)
            self.assertFalse(session.arm("late", 2.4))
            self.assertFalse(session.command("late", "press", "forward", 1, 2.4))

    def test_missing_status_times_out_without_moving(self):
        port = Port()
        session = ManualSerialSession("/dev/test", Mock(return_value=port))
        session.prepare(0)
        session.tick(0)
        session.tick(0.1)
        self.assertFalse(session.ready_to_arm(0.1))
        session.tick(30)
        self.assertTrue(port.closed)
        self.assertEqual(session.phase, "timed-out")

    def test_busy_port_never_becomes_ready(self):
        session = ManualSerialSession("/dev/test", Mock(side_effect=OSError("busy")))
        with self.assertRaises(OSError):
            session.prepare(0)
        self.assertFalse(session.armed)
        self.assertFalse(session.ready_to_arm(0))

    def test_neutral_start_and_release_allow_next_direction_without_rearm(self):
        session, port = self.ready()
        self.assertTrue(session.arm("arm", 0.3))
        self.assertTrue(session.command("arm", "press-1", "forward", 0.5, 0.4))
        session.stop("arm", "press-1")
        session.tick(1)
        self.assertTrue(session.armed)
        self.assertEqual(port.sent[-1], encode_packet(0, 1500, 1500))
        self.assertFalse(session.command("arm", "press-1", "forward", 0.5, 1.1))
        self.assertTrue(session.command("arm", "press-2", "left", 0.5, 1.1))
        port.incoming.extend(b"Remote active: 1 (hold remaining=5000ms)\n")
        session.tick(1.2)
        self.assertFalse(session.armed)
        self.assertTrue(port.closed)
