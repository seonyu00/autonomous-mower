from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MowerTopics:
    robot_id: str

    @property
    def telemetry(self) -> str:
        return f"mowers/{self.robot_id}/telemetry"

    @property
    def status(self) -> str:
        return f"mowers/{self.robot_id}/status"

    @property
    def events(self) -> str:
        return f"mowers/{self.robot_id}/events"

    @property
    def command_ack(self) -> str:
        return f"mowers/{self.robot_id}/commands/ack"

    @property
    def manual_command(self) -> str:
        return f"mowers/{self.robot_id}/commands/manual"

    @property
    def stop_command(self) -> str:
        return f"mowers/{self.robot_id}/commands/stop"

    @property
    def estop_command(self) -> str:
        return f"mowers/{self.robot_id}/commands/estop"

    @property
    def mode_command(self) -> str:
        return f"mowers/{self.robot_id}/commands/mode"

    @property
    def attachment_command(self) -> str:
        return f"mowers/{self.robot_id}/commands/attachment"

    def command_subscriptions(self) -> list[tuple[str, int]]:
        return [
            (self.manual_command, 0),
            (self.stop_command, 1),
            (self.estop_command, 1),
            (self.mode_command, 1),
            (self.attachment_command, 1),
        ]


def command_type_from_topic(topic: str) -> str:
    suffix = topic.rsplit("/", maxsplit=1)[-1]
    return {
        "manual": "manual-command",
        "stop": "stop",
        "estop": "emergency-stop",
        "mode": "change-mode",
        "attachment": "mower-attachment",
    }.get(suffix, "unknown")
