package com.autonomousmower.realtime.dto;

import java.time.Instant;

public record TelemetryMessage(
        String robotId,
        double latitude,
        double longitude,
        int batteryLevel,
        String mode,
        String workState,
        double speedMps,
        int signalStrength,
        Instant lastReceivedAt,
        String errorState
) {
}
