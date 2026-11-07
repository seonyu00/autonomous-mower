package com.autonomousmower.telemetry.service;

import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.autonomousmower.realtime.dto.RobotEventMessage;
import com.autonomousmower.robot.entity.Robot;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class TelemetryErrorHistory {
    private record Previous(Instant sampledAt, boolean active, UUID activeSession) {}
    private final JdbcTemplate db;
    private final RobotEventRepository events;
    private final ApplicationEventPublisher notifications;

    public TelemetryErrorHistory(JdbcTemplate db, RobotEventRepository events, ApplicationEventPublisher notifications) {
        this.db = db;
        this.events = events;
        this.notifications = notifications;
    }

    // 단일 기록 작업자가 텔레메트리 행, 최신 관측과 발생·복구 이벤트를 같은 트랜잭션에 보존한다.
    public void observe(Robot robot, MqttTelemetryPayload payload, Instant observedAt, UUID ingestId) {
        UUID session = payload.errorObserverSession();
        if (session == null || payload.receivedAt() == null) return;
        Instant sampledAt = payload.receivedAt().truncatedTo(ChronoUnit.MICROS);
        Previous previous = db.query("""
                SELECT sampled_at, active, active_session FROM telemetry_error_observation WHERE robot_id=?
                """, rs -> rs.next() ? new Previous(rs.getTimestamp(1).toInstant(), rs.getBoolean(2),
                rs.getObject(3, UUID.class)) : null, robot.getRobotId());
        if (previous != null && !sampledAt.isAfter(previous.sampledAt())) return;

        boolean wasActive = previous != null && previous.active();
        boolean observedActive = "emergency-stop-active".equals(payload.errorState());
        boolean sameRun = previous != null && session.equals(previous.activeSession());
        boolean recovered = wasActive && sameRun && payload.errorState() == null;
        boolean active = observedActive || (wasActive && !recovered);
        // 다른 실행의 초기 null은 이전 오류의 해제 근거가 될 수 없다.
        UUID activeSession = observedActive || (sameRun && active) ? session : null;
        db.update("""
                INSERT INTO telemetry_error_observation(robot_id, sampled_at, active, active_session) VALUES (?,?,?,?)
                ON CONFLICT(robot_id) DO UPDATE SET sampled_at=excluded.sampled_at,
                    active=excluded.active, active_session=excluded.active_session
                """, robot.getRobotId(), sampledAt.atOffset(ZoneOffset.UTC), active, activeSession);
        if (active == wasActive) return;
        String id = "telemetry-fault-" + ingestId;
        String type = active ? "emergency-stop-active" : "emergency-stop-recovered";
        String severity = active ? "critical" : "info";
        String message = active ? "비상 정지 활성화 관측" : "비상 정지 해제 관측";
        String source = "jetson-telemetry";
        events.save(new RobotEvent(id, robot, severity, type, message, LocalDateTime.ofInstant(observedAt, ZoneOffset.UTC), source));
        notifications.publishEvent(new RobotEventMessage(id, robot.getRobotId(), severity, type, message, observedAt, source, null, null));
    }
}
