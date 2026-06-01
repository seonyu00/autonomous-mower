from __future__ import annotations

import unittest

from jetson_mower_client.command_ack import publish_command_ack


class FakeMqttClient:
    def __init__(self) -> None:
        self.published: list[tuple[str, dict[str, object], int]] = []

    def publish_json(self, topic: str, payload: dict[str, object], qos: int) -> None:
        self.published.append((topic, payload, qos))


class CommandAckTest(unittest.TestCase):
    def test_estop_ack_is_published_with_qos_1(self) -> None:
        mqtt = FakeMqttClient()
        command = {
            "commandId": "cmd-estop-001",
            "robotId": "MOWER-01",
            "commandType": "emergency-stop",
        }

        publish_command_ack(
            mqtt,
            "mowers/MOWER-01/commands/ack",
            "MOWER-01",
            "jetson-MOWER-01",
            command,
            "emergency-stop",
            "accepted",
            None,
            "2026-06-01T00:00:00.000Z",
            lambda: "2026-06-01T00:00:00.010Z",
        )

        self.assertEqual(len(mqtt.published), 1)
        topic, payload, qos = mqtt.published[0]
        self.assertEqual(topic, "mowers/MOWER-01/commands/ack")
        self.assertEqual(qos, 1)
        self.assertEqual(payload["commandId"], "cmd-estop-001")
        self.assertEqual(payload["robotId"], "MOWER-01")
        self.assertEqual(payload["commandType"], "emergency-stop")
        self.assertEqual(payload["status"], "accepted")
        self.assertIsNone(payload["reason"])
        self.assertEqual(payload["edgeNodeId"], "jetson-MOWER-01")
        self.assertEqual(payload["receivedAt"], "2026-06-01T00:00:00.000Z")
        self.assertEqual(payload["ackedAt"], "2026-06-01T00:00:00.010Z")


if __name__ == "__main__":
    unittest.main()

