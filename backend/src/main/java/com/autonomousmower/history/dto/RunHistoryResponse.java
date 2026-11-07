package com.autonomousmower.history.dto;

import java.time.Instant;
import java.util.List;

public record RunHistoryResponse(String id, String robotId, Instant startedAt, Instant endedAt,
        Instant lastObservedAt, Instant checkedAt, String status, List<GeoJsonFeatureDto> routeSegments,
        Double distanceMeters, boolean hasGpsGap, boolean distancePartial, Integer coveragePercent,
        List<HistoryEventResponse> events) {}
