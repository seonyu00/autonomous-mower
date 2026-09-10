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
    private final MqttInboundPersistenceService persistenceService;
    private final CommandExecutionService commandExecutionService;
    private final TelemetryReceptionService receptionService;
    private final Clock clock;

    public MqttInboundHandler(
            RealtimePublisher realtimePublisher,
            MqttInboundPersistenceService persistenceService,
            CommandExecutionService commandExecutionService,
            TelemetryReceptionService receptionService,
            Clock clock
    ) {
        this.realtimePublisher = realtimePublisher;
        this.persistenceService = persistenceService;
        this.commandExecutionService = commandExecutionService;
        this.receptionService = receptionService;
        this.clock = clock;
    }

    public void handleTelemetry(MqttTelemetryPayload payload) {
        Instant receivedAt = clock.instant();
        if (!persistenceService.persistTelemetry(payload, receivedAt)) {
            return;
        }
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
                clock.instant()
        ));
    }

    public void handleStatus(MqttStatusPayload payload) {
        if (!persistenceService.persistStatus(payload)) {
            return;
        }
        receptionService.recordStatus(payload);
    }

    public void handleEvent(MqttEventPayload payload) {
        if (!persistenceService.persistEvent(payload)) {
            return;
        }
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
