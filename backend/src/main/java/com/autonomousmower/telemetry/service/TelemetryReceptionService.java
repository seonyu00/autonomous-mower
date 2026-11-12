package com.autonomousmower.telemetry.service;

import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.service.InboundRecord;
import com.autonomousmower.mqtt.service.TelemetrySpool;
import com.autonomousmower.realtime.dto.RobotEventMessage;
import com.autonomousmower.realtime.dto.RobotStatusMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import com.autonomousmower.telemetry.dto.TelemetryReception;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
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
    private final TelemetrySpool spool;
    private TelemetrySpool.Recording lastRecording;

    public TelemetryReceptionService(Clock clock, RealtimePublisher publisher, TelemetrySpool spool) {
        this.clock = clock;
        this.publisher = publisher;
        this.spool = spool;
    }

    // 수신과 주기 검사를 직렬화해 지연 통지가 복구 통지보다 늦게 발행되지 않게 한다.
    public void recordTelemetry(String robotId, Instant receivedAt, Instant edgeSampledAt) {
        MqttEventPayload event;
        synchronized (this) {
            ReceptionState state = states.computeIfAbsent(robotId, ignored -> new ReceptionState());
            if (state.lastReceivedAt != null && receivedAt.isBefore(state.lastReceivedAt)) return;
            state.lastReceivedAt = receivedAt;
            state.edgeSampledAt = edgeSampledAt;
            event = detectTransition(robotId, state, clock.instant());
        }
        if (event != null) recordEvent(event);
    }

    public synchronized void recordStatus(MqttStatusPayload status) {
        ReceptionState state = states.computeIfAbsent(status.robotId(), ignored -> new ReceptionState());
        state.edgeStatus = status;
        publisher.publishStatus(statusMessage(status.robotId(), state, clock.instant()));
    }

    public synchronized TelemetryReception snapshot(String robotId) {
        return snapshot(states.getOrDefault(robotId, new ReceptionState()), clock.instant());
    }

    @Scheduled(fixedDelay = 250, scheduler = "telemetryWatchdog")
    public void detectDelays() {
        List<MqttEventPayload> events = new ArrayList<>();
        synchronized (this) {
            Instant now = clock.instant();
            var recording = spool.recording();
            boolean recordingChanged = !java.util.Objects.equals(lastRecording, recording);
            lastRecording = recording;
            states.forEach((robotId, state) -> {
                String previous = state.reportedState;
                MqttEventPayload event = detectTransition(robotId, state, now);
                if (event != null) events.add(event);
                if (recordingChanged && previous.equals(state.reportedState))
                    publisher.publishStatus(statusMessage(robotId, state, now));
            });
        }
        events.forEach(this::recordEvent);
    }

    private MqttEventPayload detectTransition(String robotId, ReceptionState state, Instant now) {
        String next = snapshot(state, now).state();
        if (next.equals(state.reportedState)) return null;
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
            publisher.publishEvent(new RobotEventMessage(id, robotId, severity, eventType, message, now,
                    "telemetry-monitor", null, null));
            return new MqttEventPayload(id, robotId, severity, eventType, message, now, "telemetry-monitor");
        }
        return null;
    }

    private void recordEvent(MqttEventPayload event) {
        spool.append(InboundRecord.event(event, event.occurredAt()));
    }

    private TelemetryReception snapshot(ReceptionState state, Instant now) {
        String reception = state.lastReceivedAt == null ? "never-seen"
                : Duration.between(state.lastReceivedAt, now).compareTo(DELAY_THRESHOLD) >= 0 ? "delayed" : "normal";
        return new TelemetryReception(reception, state.lastReceivedAt, state.edgeSampledAt, now, spool.recording());
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
                reception,
                edge != null ? edge.manualLockReason() : null
        );
    }

    private static class ReceptionState {
        private Instant lastReceivedAt;
        private Instant edgeSampledAt;
        private String reportedState = "never-seen";
        private MqttStatusPayload edgeStatus;
    }
}
