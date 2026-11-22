import unittest

from jetson_mower_client.ssh_latched_frames import heartbeat_reply


class LatchedFramesTest(unittest.TestCase):
    def test_valid_ping_only_generates_non_start_reply(self):
        token = b"0123456789abcdef0123456789abcdef"
        self.assertEqual(heartbeat_reply(b"MOWER_PING " + token + b"\n"), token + b" .\n")
        self.assertEqual(heartbeat_reply(b"MOWER_PING " + token + b"\n", start=True), token + b" r\n")

    def test_rejects_incomplete_or_unexpected_input(self):
        for line in (b"", b"MOWER_PING 1234\n", b"MOWER_PING " + b"z" * 32,
                     b"MOWER_PING " + b"a" * 32 + b" r\n"):
            with self.subTest(line=line):
                self.assertIsNone(heartbeat_reply(line))
                self.assertIsNone(heartbeat_reply(line, start=True))
