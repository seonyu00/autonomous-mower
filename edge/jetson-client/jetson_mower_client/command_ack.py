from __future__ import annotations

from collections.abc import Callable
from typing import Any


def publish_command_ack(
    mqtt_client: Any,
    topic: str,
    robot_id: str,
    edge_node_id: str,
    command: dict[str, Any] | None,
    command_type: str,
    status: str,
    reason: str | None,
    received_at: str,
    utc_now: Callable[[], str],
) -> None:
    payload = {
        "commandId": command.get("commandId") if command else None,
        "robotId": robot_id,
        "commandType": command.get("commandType", command_type) if command else command_type,
        "status": status,
        "reason": reason,
        "edgeNodeId": edge_node_id,
        "receivedAt": received_at,
        "ackedAt": utc_now(),
    }
    mqtt_client.publish_json(topic, payload, qos=1)

