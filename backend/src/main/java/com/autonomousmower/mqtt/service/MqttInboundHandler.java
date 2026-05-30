package com.autonomousmower.mqtt.service;

import com.autonomousmower.mqtt.dto.MqttCommandAckPayload;
import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.autonomousmower.realtime.dto.ControlEventMessage;
import com.autonomousmower.realtime.dto.RobotEventMessage;
import com.autonomousmower.realtime.dto.RobotStatusMessage;
import com.autonomousmower.realtime.dto.TelemetryMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import org.springframework.stereotype.Service;

@Service
public class MqttInboundHandler {

    private final RealtimePublisher realtimePublisher;

    public MqttInboundHandler(RealtimePublisher realtimePublisher) {
        this.realtimePublisher = realtimePublisher;
    }

    public void handleTelemetry(MqttTelemetryPayload payload) {
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
        realtimePublisher.publishControlEvent(new ControlEventMessage(
                payload.robotId(),
                payload.commandId(),
                payload.commandType(),
                payload.status(),
                payload.reason(),
                payload.edgeNodeId(),
                payload.receivedAt(),
                payload.ackedAt()
        ));
    }
}
