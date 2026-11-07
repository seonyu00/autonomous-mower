package com.autonomousmower.mqtt.service;

import com.autonomousmower.control.service.CommandExecutionService;
import com.autonomousmower.mqtt.dto.MqttCommandAckPayload;
import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.autonomousmower.realtime.dto.RobotEventMessage;
import com.autonomousmower.telemetry.service.TelemetryReceptionService;
import java.time.Clock;
import java.time.Instant;
import com.autonomousmower.realtime.dto.TelemetryMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import org.springframework.stereotype.Service;

@Service
public class MqttInboundHandler {

    private final RealtimePublisher realtimePublisher;
    private final TelemetrySpool spool;
    private final CommandExecutionService commandExecutionService;
    private final TelemetryReceptionService receptionService;
    private final Clock clock;
    private final TelemetryRegistration registration;

    public MqttInboundHandler(
            RealtimePublisher realtimePublisher,
            TelemetrySpool spool,
            CommandExecutionService commandExecutionService,
            TelemetryReceptionService receptionService,
            Clock clock,
            TelemetryRegistration registration
    ) {
        this.realtimePublisher = realtimePublisher;
        this.spool = spool;
        this.commandExecutionService = commandExecutionService;
        this.receptionService = receptionService;
        this.clock = clock;
        this.registration = registration;
    }

    public void handleTelemetry(MqttTelemetryPayload payload) {
        Instant receivedAt = clock.instant();
        if (!registration.accepts(payload.robotId())) {
            if (registration.wasConfirmed(payload.robotId())) spool.markGap();
            return;
        }
        spool.append(InboundRecord.telemetry(payload, receivedAt));
        receptionService.recordTelemetry(payload.robotId(), receivedAt, payload.receivedAt());
        realtimePublisher.publishTelemetry(new TelemetryMessage(
                payload.robotId(),
                payload.latitude(),
                payload.longitude(),
                payload.batteryLevel(),
                payload.mode(),
                payload.workState(),
                payload.speedMps(),
                payload.signalStrength(),
                receivedAt,
                payload.errorState(),
                payload.receivedAt(),
                clock.instant(), payload.errorObserverSession() != null
        ));
    }

    public void handleStatus(MqttStatusPayload payload) {
        if (!registration.accepts(payload.robotId())) {
            return;
        }
        spool.append(InboundRecord.status(payload, clock.instant()));
        receptionService.recordStatus(payload);
    }

    public void handleEvent(MqttEventPayload payload) {
        if (!registration.accepts(payload.robotId())) {
            return;
        }
        spool.append(InboundRecord.event(payload, clock.instant()));
        realtimePublisher.publishEvent(new RobotEventMessage(
                payload.id(),
                payload.robotId(),
                payload.severity(),
                payload.eventType(),
                payload.message(),
                payload.occurredAt(),
                payload.source(),
                null,
                null
        ));
    }

    public void handleCommandAck(MqttCommandAckPayload payload) {
        commandExecutionService.applyAck(payload);
    }
}
