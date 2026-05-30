package com.autonomousmower.history.dto;

import java.time.LocalDateTime;

public record HistoryEventResponse(
        String id,
        String robotId,
        LocalDateTime occurredAt,
        String severity,
        String type,
        String message,
        GeoJsonFeatureDto location
) {
}
