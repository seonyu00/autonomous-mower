package com.autonomousmower.realtime.dto;

import com.autonomousmower.history.dto.GeoJsonFeatureDto;
import com.autonomousmower.logs.dto.SnapshotResponse;
import java.time.Instant;

public record RobotEventMessage(
        String id,
        String robotId,
        String severity,
        String eventType,
        String message,
        Instant occurredAt,
        String source,
        GeoJsonFeatureDto location,
        SnapshotResponse snapshot
) {
}
