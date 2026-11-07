package com.autonomousmower.mqtt.service;

import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import java.time.Instant;
import java.util.UUID;

public record InboundRecord(UUID id, Instant observedAt, MqttTelemetryPayload telemetry,
                            MqttStatusPayload status, MqttEventPayload event, com.autonomousmower.history.dto.RunSignal runSignal) {
    public InboundRecord(UUID id, Instant observedAt, MqttTelemetryPayload telemetry,
            MqttStatusPayload status, MqttEventPayload event) {
        this(id, observedAt, telemetry, status, event, null);
    }
    public static InboundRecord run(com.autonomousmower.history.dto.RunSignal signal, Instant observedAt) {
        return new InboundRecord(UUID.randomUUID(), observedAt, null, null, null, signal);
    }
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
