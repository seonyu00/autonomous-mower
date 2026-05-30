package com.autonomousmower.mqtt.service;

import com.autonomousmower.control.service.CommandExecutionService;
import com.autonomousmower.mqtt.dto.MqttCommandAckPayload;
import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.autonomousmower.realtime.dto.RobotEventMessage;
import com.autonomousmower.realtime.dto.RobotStatusMessage;
import com.autonomousmower.realtime.dto.TelemetryMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import org.springframework.stereotype.Service;

@Service
public class MqttInboundHandler {

    private final RealtimePublisher realtimePublisher;
    private final MqttInboundPersistenceService persistenceService;
    private final CommandExecutionService commandExecutionService;

    public MqttInboundHandler(
            RealtimePublisher realtimePublisher,
            MqttInboundPersistenceService persistenceService,
            CommandExecutionService commandExecutionService
    ) {
        this.realtimePublisher = realtimePublisher;
        this.persistenceService = persistenceService;
        this.commandExecutionService = commandExecutionService;
    }

    public void handleTelemetry(MqttTelemetryPayload payload) {
        if (!persistenceService.persistTelemetry(payload)) {
            return;
        }
        realtimePublisher.publishTelemetry(new TelemetryMessage(
                payload.robotId(),
                payload.latitude(),
                payload.longitude(),
                payload.batteryLevel(),
                payload.mode(),
                payload.workState(),
                payload.speedMps(),
                payload.signalStrength(),
                payload.receivedAt(),
                payload.errorState()
        ));
    }

    public void handleStatus(MqttStatusPayload payload) {
        if (!persistenceService.persistStatus(payload)) {
            return;
        }
        realtimePublisher.publishStatus(new RobotStatusMessage(
                payload.robotId(),
                payload.connectionState(),
                payload.mqttState(),
                "connected",
                payload.edgeState(),
                payload.lastSeenAt(),
                payload.stale()
        ));
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
