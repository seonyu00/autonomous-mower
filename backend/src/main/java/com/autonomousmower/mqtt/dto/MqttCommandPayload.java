package com.autonomousmower.mqtt.dto;

import java.time.Instant;
import java.util.Map;

public record MqttCommandPayload(
        String commandId,
        String robotId,
        String commandType,
        String requestedBy,
        Instant requestedAt,
        String priority,
        Map<String, Object> parameters
) {
}
