package com.autonomousmower.mqtt.service;

import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.telemetry.entity.TelemetryLog;
import com.autonomousmower.telemetry.repository.TelemetryLogRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
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
    private final Clock clock;
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), WGS84_SRID);

    public MqttInboundPersistenceService(
            RobotRepository robotRepository,
            TelemetryLogRepository telemetryLogRepository,
            RobotEventRepository robotEventRepository,
            Clock clock
    ) {
        this.robotRepository = robotRepository;
        this.telemetryLogRepository = telemetryLogRepository;
        this.robotEventRepository = robotEventRepository;
        this.clock = clock;
    }

    @Transactional
    public boolean persistTelemetry(MqttTelemetryPayload payload) {
        Optional<Robot> robot = knownRobot(payload.robotId(), "telemetry");
        if (robot.isEmpty()) {
            return false;
        }

        Point point = geometryFactory.createPoint(new Coordinate(payload.longitude(), payload.latitude()));
        point.setSRID(WGS84_SRID);
        telemetryLogRepository.save(new TelemetryLog(
                robot.get(),
                point,
                payload.batteryLevel(),
                robotState(payload),
                serverNow()
        ));
        return true;
    }

    @Transactional
    public boolean persistStatus(MqttStatusPayload payload) {
        Optional<Robot> robot = knownRobot(payload.robotId(), "status");
        if (robot.isEmpty()) {
            return false;
        }

        robotEventRepository.save(new RobotEvent(
                "status-" + payload.robotId() + "-" + UUID.randomUUID(),
                robot.get(),
                payload.stale() ? "warning" : "info",
                "status-update",
                "Edge status: connection=%s, mqtt=%s, edge=%s".formatted(
                        payload.connectionState(),
                        payload.mqttState(),
                        payload.edgeState()
                ),
                serverNow(),
                "mqtt-status"
        ));
        return true;
    }

    @Transactional
    public boolean persistEvent(MqttEventPayload payload) {
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
                toUtcLocal(payload.occurredAt() == null ? Instant.now(clock) : payload.occurredAt()),
                payload.source()
        ));
        return true;
    }

    private Optional<Robot> knownRobot(String robotId, String payloadType) {
        Optional<Robot> robot = robotRepository.findById(robotId);
        if (robot.isEmpty()) {
            log.warn("Ignoring MQTT {} payload for unknown robotId={}", payloadType, robotId);
        }
        return robot;
    }

    private String robotState(MqttTelemetryPayload payload) {
        if (payload.errorState() != null && !payload.errorState().isBlank()) {
            return "ERROR";
        }
        return payload.workState() == null || payload.workState().isBlank()
                ? payload.mode().toUpperCase()
                : payload.workState().toUpperCase();
    }

    private LocalDateTime serverNow() {
        return toUtcLocal(Instant.now(clock));
    }

    private LocalDateTime toUtcLocal(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
