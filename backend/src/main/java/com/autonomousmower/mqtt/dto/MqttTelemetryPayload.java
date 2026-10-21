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
        String errorState
) {
    public MqttTelemetryPayload {
        // 한쪽 좌표만으로는 위치를 만들 수 없지만 다른 센서값은 계속 처리한다.
        if (latitude == null || longitude == null) {
            latitude = null;
            longitude = null;
        }
    }
}
