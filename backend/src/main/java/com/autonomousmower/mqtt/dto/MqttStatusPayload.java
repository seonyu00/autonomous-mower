package com.autonomousmower.mqtt.dto;

import java.time.Instant;

public record MqttStatusPayload(
        String robotId,
        String connectionState,
        String mqttState,
        String edgeState,
        Instant lastSeenAt,
        boolean stale,
        String manualLockReason
) {
    public MqttStatusPayload(String robotId, String connectionState, String mqttState, String edgeState,
                            Instant lastSeenAt, boolean stale) {
        this(robotId, connectionState, mqttState, edgeState, lastSeenAt, stale, null);
    }
}
