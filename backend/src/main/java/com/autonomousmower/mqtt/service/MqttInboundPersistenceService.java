package com.autonomousmower.mqtt.service;

import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.telemetry.entity.TelemetryLog;
import com.autonomousmower.telemetry.service.TelemetryErrorHistory;
import com.autonomousmower.telemetry.repository.TelemetryLogRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MqttInboundPersistenceService {

    private static final Logger log = LoggerFactory.getLogger(MqttInboundPersistenceService.class);
    private static final int WGS84_SRID = 4326;

    private final RobotRepository robotRepository;
    private final TelemetryLogRepository telemetryLogRepository;
    private final RobotEventRepository robotEventRepository;
    private final TelemetryErrorHistory errors;
    private final Map<String, StatusSignature> lastStatuses = new HashMap<>();
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), WGS84_SRID);

    public MqttInboundPersistenceService(
            RobotRepository robotRepository,
            TelemetryLogRepository telemetryLogRepository,
            RobotEventRepository robotEventRepository,
            TelemetryErrorHistory errors
    ) {
        this.robotRepository = robotRepository;
        this.telemetryLogRepository = telemetryLogRepository;
        this.robotEventRepository = robotEventRepository;
        this.errors = errors;
    }

    @org.springframework.beans.factory.annotation.Autowired
    private com.autonomousmower.history.service.RunSignalPersistence runSignals;

    @Transactional
    public boolean persist(InboundRecord record) {
        if (record.runSignal() != null) {
            try { return runSignals.persist(record.runSignal(), record.observedAt()); }
            catch (java.io.IOException error) { throw new java.io.UncheckedIOException(error); }
        }
        if (record.telemetry() != null) {
            if (telemetryLogRepository.existsByIngestId(record.id())) return true;
            return persistTelemetry(record.telemetry(), record.observedAt(), record.id());
        }
        if (record.status() != null) {
            String id = "status-" + record.id();
            if (robotEventRepository.existsById(id)) return true;
            return persistStatus(record.status(), id, record.observedAt());
        }
        if (robotEventRepository.existsById(record.event().id())) return true;
        return persistEvent(record.event(), record.observedAt());
    }

    private boolean persistTelemetry(MqttTelemetryPayload payload, Instant receivedAt, UUID ingestId) {
        Optional<Robot> robot = knownRobot(payload.robotId(), "telemetry");
        if (robot.isEmpty()) {
            return false;
        }

        Point point = null;
        if (payload.latitude() != null && payload.longitude() != null) {
            point = geometryFactory.createPoint(new Coordinate(payload.longitude(), payload.latitude()));
            point.setSRID(WGS84_SRID);
        }
        TelemetryLog sample = new TelemetryLog(
                robot.get(),
                point,
                payload.batteryLevel(),
                robotState(payload),
                toUtcLocal(receivedAt),
                payload.errorState()
        );
        sample.setIngestId(ingestId);
        telemetryLogRepository.save(sample);
        errors.observe(robot.get(), payload, receivedAt, ingestId);
        return true;
    }

    private boolean persistStatus(MqttStatusPayload payload, String id, Instant observedAt) {
        Optional<Robot> robot = knownRobot(payload.robotId(), "status");
        if (robot.isEmpty()) {
            return false;
        }

        StatusSignature signature = new StatusSignature(payload.connectionState(), payload.mqttState(), payload.edgeState(), payload.stale());
        if (signature.equals(lastStatuses.get(payload.robotId()))) return true;

        robotEventRepository.save(new RobotEvent(
                id,
                robot.get(),
                payload.stale() ? "warning" : "info",
                "status-update",
                "Edge status: connection=%s, mqtt=%s, edge=%s".formatted(
                        payload.connectionState(),
                        payload.mqttState(),
                        payload.edgeState()
                ),
                toUtcLocal(observedAt),
                "mqtt-status"
        ));
        org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void afterCommit() { lastStatuses.put(payload.robotId(), signature); }
                });
        return true;
    }

    private boolean persistEvent(MqttEventPayload payload, Instant observedAt) {
        Optional<Robot> robot = knownRobot(payload.robotId(), "event");
        if (robot.isEmpty()) {
            return false;
        }

        robotEventRepository.save(new RobotEvent(
                payload.id(),
                robot.get(),
                payload.severity(),
                payload.eventType(),
                payload.message(),
                toUtcLocal(payload.occurredAt() == null ? observedAt : payload.occurredAt()),
                payload.source()
        ));
        return true;
    }

    private record StatusSignature(String connection, String mqtt, String edge, boolean stale) {}

    private Optional<Robot> knownRobot(String robotId, String payloadType) {
        Optional<Robot> robot = robotRepository.findById(robotId).filter(Robot::isEnabled);
        if (robot.isEmpty()) {
            log.warn("Ignoring MQTT {} payload for unknown robotId={}", payloadType, robotId);
        }
        return robot;
    }

    private String robotState(MqttTelemetryPayload payload) {
        if (payload.errorState() != null && !payload.errorState().isBlank()) {
            return "ERROR";
        }
        if (payload.workState() != null && !payload.workState().isBlank()) {
            return payload.workState().toUpperCase();
        }
        return payload.mode() == null || payload.mode().isBlank() ? null : payload.mode().toUpperCase();
    }

    private LocalDateTime toUtcLocal(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
