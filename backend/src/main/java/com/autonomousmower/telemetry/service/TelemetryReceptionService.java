package com.autonomousmower.telemetry.service;

import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.service.MqttInboundPersistenceService;
import com.autonomousmower.realtime.dto.RobotEventMessage;
import com.autonomousmower.realtime.dto.RobotStatusMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import com.autonomousmower.telemetry.dto.TelemetryReception;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class TelemetryReceptionService {

    private static final Duration DELAY_THRESHOLD = Duration.ofSeconds(3);
    private final Map<String, ReceptionState> states = new HashMap<>();
    private final Clock clock;
    private final RealtimePublisher publisher;
    private final MqttInboundPersistenceService persistence;

    public TelemetryReceptionService(Clock clock, RealtimePublisher publisher, MqttInboundPersistenceService persistence) {
        this.clock = clock;
        this.publisher = publisher;
        this.persistence = persistence;
    }

    // 수신과 주기 검사를 직렬화해 지연 통지가 복구 통지보다 늦게 발행되지 않게 한다.
    public synchronized void recordTelemetry(String robotId, Instant receivedAt, Instant edgeSampledAt) {
        ReceptionState state = states.computeIfAbsent(robotId, ignored -> new ReceptionState());
        if (state.lastReceivedAt != null && receivedAt.isBefore(state.lastReceivedAt)) return;
        state.lastReceivedAt = receivedAt;
        state.edgeSampledAt = edgeSampledAt;
        detectTransition(robotId, state, clock.instant());
    }

    public synchronized void recordStatus(MqttStatusPayload status) {
        ReceptionState state = states.computeIfAbsent(status.robotId(), ignored -> new ReceptionState());
        state.edgeStatus = status;
        publisher.publishStatus(statusMessage(status.robotId(), state, clock.instant()));
    }

    public synchronized TelemetryReception snapshot(String robotId) {
        return snapshot(states.getOrDefault(robotId, new ReceptionState()), clock.instant());
    }

    @Scheduled(fixedDelay = 250)
    public synchronized void detectDelays() {
        Instant now = clock.instant();
        states.forEach((robotId, state) -> detectTransition(robotId, state, now));
    }

    private void detectTransition(String robotId, ReceptionState state, Instant now) {
        String next = snapshot(state, now).state();
        if (next.equals(state.reportedState)) return;
        String previous = state.reportedState;
        state.reportedState = next;
        publisher.publishStatus(statusMessage(robotId, state, now));

        // 첫 수신은 정상 초기화이며, 중단과 복구만 이벤트 이력으로 남긴다.
        if ("delayed".equals(next) || "delayed".equals(previous)) {
            boolean delayed = "delayed".equals(next);
            String id = "telemetry-" + UUID.randomUUID();
            String severity = delayed ? "warning" : "info";
            String eventType = delayed ? "telemetry-delayed" : "telemetry-recovered";
            String message = delayed ? "텔레메트리를 3초 이상 수신하지 못했습니다." : "텔레메트리 수신이 복구됐습니다.";
            if (persistence.persistEvent(new MqttEventPayload(id, robotId, severity, eventType, message, now, "telemetry-monitor"))) {
                publisher.publishEvent(new RobotEventMessage(id, robotId, severity, eventType, message, now, "telemetry-monitor", null, null));
            }
        }
    }

    private TelemetryReception snapshot(ReceptionState state, Instant now) {
        String reception = state.lastReceivedAt == null ? "never-seen"
                : Duration.between(state.lastReceivedAt, now).compareTo(DELAY_THRESHOLD) >= 0 ? "delayed" : "normal";
        return new TelemetryReception(reception, state.lastReceivedAt, state.edgeSampledAt, now);
    }

    private RobotStatusMessage statusMessage(String robotId, ReceptionState state, Instant now) {
        TelemetryReception reception = snapshot(state, now);
        MqttStatusPayload edge = state.edgeStatus;
        boolean delayed = "delayed".equals(reception.state());
        String connection = edge != null ? edge.connectionState() : state.lastReceivedAt == null ? "offline" : "online";
        return new RobotStatusMessage(
                robotId,
                delayed && "online".equals(connection) ? "degraded" : connection,
                edge != null ? edge.mqttState() : state.lastReceivedAt == null ? "disconnected" : "connected",
                "connected",
                edge != null ? edge.edgeState() : "unknown",
                edge != null ? edge.lastSeenAt() : state.lastReceivedAt,
                delayed || (edge != null && edge.stale()),
                reception
        );
    }

    private static class ReceptionState {
        private Instant lastReceivedAt;
        private Instant edgeSampledAt;
        private String reportedState = "never-seen";
        private MqttStatusPayload edgeStatus;
    }
}
