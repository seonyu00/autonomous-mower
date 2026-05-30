package com.autonomousmower.mqtt.dto;

import java.time.Instant;

public record MqttEventPayload(
        String id,
        String robotId,
        String severity,
        String eventType,
        String message,
        Instant occurredAt,
        String source
) {
}
