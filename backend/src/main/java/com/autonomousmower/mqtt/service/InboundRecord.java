package com.autonomousmower.mqtt.service;

import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import java.time.Instant;
import java.util.UUID;

public record InboundRecord(UUID id, Instant observedAt, MqttTelemetryPayload telemetry,
                            MqttStatusPayload status, MqttEventPayload event) {
    public static InboundRecord telemetry(MqttTelemetryPayload payload, Instant now) {
        return new InboundRecord(UUID.randomUUID(), now, payload, null, null);
    }

    public static InboundRecord status(MqttStatusPayload payload, Instant now) {
        return new InboundRecord(UUID.randomUUID(), now, null, payload, null);
    }

    public static InboundRecord event(MqttEventPayload payload, Instant now) {
        return new InboundRecord(UUID.randomUUID(), now, null, null, payload);
    }
}
