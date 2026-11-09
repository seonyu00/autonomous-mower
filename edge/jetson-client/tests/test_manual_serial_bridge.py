import unittest

from jetson_mower_client.manual_serial_bridge import ManualSerialBridge
from jetson_mower_client.manual_serial_protocol import encode_packet


class SerialStub:
    def __init__(self):
        self.incoming = bytearray()
        self.sent = []

    @property
    def in_waiting(self):
        return len(self.incoming)

    def read(self, size):
        data = bytes(self.incoming[:size])
        del self.incoming[:size]
        return data

    def reset_input_buffer(self):
        self.incoming.clear()

    def write(self, packet):
        self.sent.append(packet)
        return len(packet)


class ManualSerialBridgeTest(unittest.TestCase):
    def test_fragmented_feedback_and_override_disarm(self):
        port = SerialStub()
        bridge = ManualSerialBridge(port)
        self.assertFalse(bridge.arm("attempt-0", 0))
        bridge.tick(0)
        port.incoming.extend(b"Remote active: 1 (hold remaining=5000ms)\n")
        bridge.tick(0.5)
        port.incoming.extend(b"Remote active: 0 (hold ")
        bridge.tick(1)
        self.assertFalse(bridge.arm("attempt-1", 1))
        port.incoming.extend(b"remaining=0ms)\r\n")
        bridge.tick(1.1)
        self.assertTrue(bridge.arm("epoch", 1.1))
        self.assertTrue(bridge.command("epoch", "press-1", "forward", 1, 1.2))
        bridge.tick(1.3)
        self.assertEqual(port.sent[-1], encode_packet(1, 1800, 1800))
        port.incoming.extend(b"Remote active: 1 (hold remaining=5000ms)\r\n")
        bridge.tick(1.4)
        self.assertEqual(port.sent[-1], encode_packet(0, 1500, 1500))
        self.assertFalse(bridge.command("epoch", "press-1", "forward", 1, 1.5))

    def test_delayed_loop_discards_old_buffered_remote_status(self):
        port = SerialStub()
        bridge = ManualSerialBridge(port)
        bridge.tick(0)
        port.incoming.extend(b"Remote active: 0 (hold remaining=0ms)\n")
        bridge.tick(3)
        self.assertFalse(bridge.arm("epoch", 3))

    def test_partial_write_disables_arm(self):
        port = SerialStub()
        port.write = lambda _packet: 1
        bridge = ManualSerialBridge(port)
        with self.assertRaises(OSError):
            bridge.tick(0)
        self.assertFalse(bridge.arm("epoch", 1))

    def test_queued_diagnostics_cannot_authorize_rearm(self):
        port = SerialStub()
        bridge = ManualSerialBridge(port)
        bridge.tick(0)
        port.incoming.extend(b"Remote active: 1 (hold remaining=5000ms)\nRemote active: 0 (hold remaining=0ms)\n")
        bridge.tick(0.1)
        self.assertFalse(bridge.arm("epoch", 0.1))


if __name__ == "__main__":
    unittest.main()
