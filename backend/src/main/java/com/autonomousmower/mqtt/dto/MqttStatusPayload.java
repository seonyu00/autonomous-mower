package com.autonomousmower.mqtt.dto;

import java.time.Instant;
import com.fasterxml.jackson.databind.JsonNode;

public record MqttStatusPayload(
        String robotId,
        String connectionState,
        String mqttState,
        String edgeState,
        Instant lastSeenAt,
        boolean stale,
        String manualLockReason,
        String autonomyBlockReason,
        Boolean autonomyReady,
        JsonNode autoMap
) {
    public MqttStatusPayload(String robotId, String connectionState, String mqttState, String edgeState,
                            Instant lastSeenAt, boolean stale, String manualLockReason, String autonomyBlockReason,
                            Boolean autonomyReady) {
        this(robotId, connectionState, mqttState, edgeState, lastSeenAt, stale, manualLockReason,
                autonomyBlockReason, autonomyReady, null);
    }
    public MqttStatusPayload(String robotId, String connectionState, String mqttState, String edgeState,
                            Instant lastSeenAt, boolean stale, String manualLockReason, String autonomyBlockReason) {
        this(robotId, connectionState, mqttState, edgeState, lastSeenAt, stale, manualLockReason, autonomyBlockReason, null);
    }

    public MqttStatusPayload(String robotId, String connectionState, String mqttState, String edgeState,
                            Instant lastSeenAt, boolean stale, String manualLockReason) {
        this(robotId, connectionState, mqttState, edgeState, lastSeenAt, stale, manualLockReason, null, null);
    }

    public MqttStatusPayload(String robotId, String connectionState, String mqttState, String edgeState,
                            Instant lastSeenAt, boolean stale) {
        this(robotId, connectionState, mqttState, edgeState, lastSeenAt, stale, null);
    }
}
