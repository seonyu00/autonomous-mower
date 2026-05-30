package com.autonomousmower.mqtt.dto;

import java.time.Instant;

public record MqttTelemetryPayload(
        String robotId,
        double latitude,
        double longitude,
        int batteryLevel,
        String mode,
        String workState,
        double speedMps,
        int signalStrength,
        Instant receivedAt,
        String errorState
) {
}
