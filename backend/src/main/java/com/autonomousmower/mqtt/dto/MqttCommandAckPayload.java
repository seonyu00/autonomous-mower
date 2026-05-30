package com.autonomousmower.mqtt.dto;

import java.time.Instant;

public record MqttCommandAckPayload(
        String commandId,
        String robotId,
        String commandType,
        String status,
        String reason,
        String edgeNodeId,
        Instant receivedAt,
        Instant ackedAt
) {
}
