package com.autonomousmower.history.dto;

import java.time.Instant;
import java.util.List;

public record RunHistoryResponse(String id, String robotId, Instant startedAt, Instant endedAt,
        Instant lastObservedAt, Instant checkedAt, String status, List<GeoJsonFeatureDto> routeSegments,
        Double distanceMeters, boolean hasGpsGap, boolean distancePartial, Integer coveragePercent,
        List<HistoryEventResponse> events, Instant waitingSince, MowingEstimate mowingEstimate) {
    public RunHistoryResponse(String id, String robotId, Instant startedAt, Instant endedAt,
            Instant lastObservedAt, Instant checkedAt, String status, List<GeoJsonFeatureDto> routeSegments,
            Double distanceMeters, boolean hasGpsGap, boolean distancePartial, Integer coveragePercent,
            List<HistoryEventResponse> events, Instant waitingSince) {
        this(id, robotId, startedAt, endedAt, lastObservedAt, checkedAt, status, routeSegments,
                distanceMeters, hasGpsGap, distancePartial, coveragePercent, events, waitingSince, null);
    }
    public RunHistoryResponse(String id, String robotId, Instant startedAt, Instant endedAt,
            Instant lastObservedAt, Instant checkedAt, String status, List<GeoJsonFeatureDto> routeSegments,
            Double distanceMeters, boolean hasGpsGap, boolean distancePartial, Integer coveragePercent,
            List<HistoryEventResponse> events) {
        this(id, robotId, startedAt, endedAt, lastObservedAt, checkedAt, status, routeSegments,
                distanceMeters, hasGpsGap, distancePartial, coveragePercent, events, null);
    }
}
