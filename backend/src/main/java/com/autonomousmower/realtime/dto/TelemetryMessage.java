package com.autonomousmower.realtime.dto;

import java.time.Instant;

public record TelemetryMessage(
        String robotId,
        Double latitude,
        Double longitude,
        Integer batteryLevel,
        String mode,
        String workState,
        Double speedMps,
        Integer signalStrength,
        Instant lastReceivedAt,
        String errorState,
        Instant edgeSampledAt,
        Instant serverTimestamp
) {
}
