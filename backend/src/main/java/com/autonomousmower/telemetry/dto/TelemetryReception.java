package com.autonomousmower.telemetry.dto;

import java.time.Instant;

public record TelemetryReception(
        String state,
        Instant lastReceivedAt,
        Instant edgeSampledAt,
        Instant checkedAt
) {
}
