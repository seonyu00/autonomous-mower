import unittest

from jetson_mower_client.manual_serial_protocol import encode_packet
from jetson_mower_client.manual_serial_state import ManualSerialState


class ManualSerialStateTest(unittest.TestCase):
    def test_requires_fresh_clear_remote_status_and_explicit_arm(self):
        state = ManualSerialState()
        self.assertFalse(state.arm("attempt", 0))
        self.assertTrue(state.observe("Remote active: 0 (hold remaining=0ms)", 1))
        self.assertFalse(state.command("epoch", "press-1", "forward", 1, 1))
        self.assertTrue(state.arm("epoch", 1))
        self.assertTrue(state.command("epoch", "press-1", "forward", 1, 1.1))
        self.assertEqual(state.packet(1.2), encode_packet(1, 1600, 1600))

    def test_release_selects_remote_and_input_timeout_requires_rearm(self):
        state = ManualSerialState()
        state.observe("Remote active: 1 (hold remaining=5000ms)", 0.9)
        state.observe("Remote active: 0 (hold remaining=0ms)", 1)
        state.arm("epoch", 1)
        state.command("epoch", "press-1", "forward", 1, 1)
        state.stop("epoch", "press-1")
        self.assertEqual(state.packet(1.1), encode_packet(0, 1500, 1500))
        self.assertFalse(state.command("epoch", "press-1", "forward", 1, 1.15))
        state.command("epoch", "press-2", "forward", 1, 1.2)
        self.assertEqual(state.packet(1.6), encode_packet(0, 1500, 1500))
        self.assertFalse(state.command("epoch", "press-1", "forward", 1, 1.8))

    def test_remote_override_latches_until_explicit_rearm(self):
        state = ManualSerialState()
        state.observe("Remote active: 1 (hold remaining=5000ms)", 0.9)
        state.observe("Remote active: 0 (hold remaining=0ms)", 1)
        state.arm("epoch", 1)
        state.command("epoch", "press-1", "forward", 1, 1)
        state.observe("Remote active: 1 (hold remaining=5000ms)", 1.1)
        self.assertEqual(state.packet(1.1), encode_packet(0, 1500, 1500))
        state.observe("Remote active: 0 (hold remaining=0ms)", 7)
        self.assertFalse(state.command("epoch", "press-1", "forward", 1, 7))
        self.assertFalse(state.arm("epoch", 7))
        self.assertTrue(state.arm("new-epoch", 7))

    def test_missing_or_malformed_feedback_never_enables_output(self):
        state = ManualSerialState()
        self.assertFalse(state.observe("Remote active: 0", 1))
        self.assertFalse(state.arm("epoch", 1))
        state.observe("Remote active: 1 (hold remaining=5000ms)", 1.9)
        state.observe("Remote active: 0 (hold remaining=0ms)", 2)
        state.arm("fresh-epoch", 2)
        state.command("fresh-epoch", "press-1", "forward", 1, 2)
        self.assertEqual(state.packet(4.5), encode_packet(0, 1500, 1500))
        self.assertFalse(state.armed)

    def test_late_press_cannot_resume_after_release_or_new_arm(self):
        state = ManualSerialState()
        state.observe("Remote active: 1 (hold remaining=5000ms)", 0.9)
        state.observe("Remote active: 0 (hold remaining=0ms)", 1)
        state.arm("old-arm", 1)
        state.stop("old-arm", "old-press")
        self.assertFalse(state.command("old-arm", "old-press", "forward", 1, 1.1))
        self.assertTrue(state.command("old-arm", "new-press", "forward", 1, 1.2))
        state.disarm()
        state.arm("new-arm", 1.3)
        self.assertFalse(state.command("old-arm", "new-press", "forward", 1, 1.4))

    def test_network_delay_consumes_input_lifetime(self):
        state = ManualSerialState()
        state.observe("Remote active: 1 (hold remaining=5000ms)", 0.9)
        state.observe("Remote active: 0 (hold remaining=0ms)", 1)
        state.arm("arm", 1)
        self.assertTrue(state.command("arm", "press", "forward", 1, 1, 0.3))
        self.assertEqual(state.packet(1.06), encode_packet(0, 1500, 1500))


if __name__ == "__main__":
    unittest.main()
