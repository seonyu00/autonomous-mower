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
        Instant serverTimestamp,
        boolean errorObserved,
        Double headingDegrees,
        String headingSource,
        Instant headingObservedAt
) {
    public TelemetryMessage(String robotId, Double latitude, Double longitude, Integer batteryLevel,
            String mode, String workState, Double speedMps, Integer signalStrength, Instant lastReceivedAt,
            String errorState, Instant edgeSampledAt, Instant serverTimestamp, boolean errorObserved) {
        this(robotId,latitude,longitude,batteryLevel,mode,workState,speedMps,signalStrength,lastReceivedAt,
             errorState,edgeSampledAt,serverTimestamp,errorObserved,null,null,null);
    }
}
