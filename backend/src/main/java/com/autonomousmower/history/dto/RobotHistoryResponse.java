package com.autonomousmower.history.dto;

import java.time.LocalDateTime;
import java.util.List;

public record RobotHistoryResponse(
        String id,
        String robotId,
        LocalDateTime startedAt,
        LocalDateTime endedAt,
        GeoJsonFeatureDto route,
        List<HistoryEventResponse> events,
        double distanceMeters,
        int coveragePercent
) {
}
