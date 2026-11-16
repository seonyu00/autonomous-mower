package com.autonomousmower.mqtt.dto;

import java.time.Instant;

public record MqttTelemetryPayload(
        String robotId,
        Double latitude,
        Double longitude,
        Integer batteryLevel,
        String mode,
        String workState,
        Double speedMps,
        Integer signalStrength,
        Instant receivedAt,
        String errorState,
        java.util.UUID errorObserverSession,
        Double headingDegrees,
        String headingSource,
        Instant headingObservedAt
) {
    public MqttTelemetryPayload {
        // 한쪽 좌표만으로는 위치를 만들 수 없지만 다른 센서값은 계속 처리한다.
        if (latitude == null || longitude == null) {
            latitude = null;
            longitude = null;
        }
        if (headingDegrees == null || !Double.isFinite(headingDegrees)
                || headingDegrees < 0 || headingDegrees >= 360 || !"dual-gps".equals(headingSource)
                || headingObservedAt == null || receivedAt == null
                || headingObservedAt.isAfter(receivedAt)
                || !headingObservedAt.isAfter(receivedAt.minusSeconds(3))) {
            headingDegrees = null;
            headingSource = null;
            headingObservedAt = null;
        }
    }

    public MqttTelemetryPayload(String robotId, Double latitude, Double longitude, Integer batteryLevel,
            String mode, String workState, Double speedMps, Integer signalStrength, Instant receivedAt,
            String errorState, java.util.UUID errorObserverSession) {
        this(robotId,latitude,longitude,batteryLevel,mode,workState,speedMps,signalStrength,receivedAt,
             errorState,errorObserverSession,null,null,null);
    }
}
