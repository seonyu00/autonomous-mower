package com.autonomousmower.telemetry.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.service.MqttInboundPersistenceService;
import com.autonomousmower.realtime.dto.RobotStatusMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import java.time.Clock;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class TelemetryReceptionServiceTest {

    private final Instant start = Instant.parse("2026-09-10T00:00:00Z");
    private Instant now;
    private RealtimePublisher publisher;
    private MqttInboundPersistenceService persistence;
    private TelemetryReceptionService service;

    @BeforeEach
    void setUp() {
        now = start;
        Clock clock = mock(Clock.class);
        when(clock.instant()).thenAnswer(ignored -> now);
        publisher = mock(RealtimePublisher.class);
        persistence = mock(MqttInboundPersistenceService.class);
        when(persistence.persistEvent(any())).thenReturn(true);
        service = new TelemetryReceptionService(clock, publisher, persistence);
    }

    @Test
    void neverSeenDoesNotBecomeDelayedJustBecauseTimePasses() {
        now = start.plusSeconds(3600);
        service.detectDelays();
        assertThat(service.snapshot("unseen").state()).isEqualTo("never-seen");
        assertThat(service.snapshot("unseen").lastReceivedAt()).isNull();
        verifyNoInteractions(publisher);
        verify(persistence, never()).persistEvent(any());
    }

    @Test
    void detectsExactThreeSecondBoundaryOnceAndRecoversOnce() {
        Instant edgeTime = start.plusSeconds(3600);
        service.recordTelemetry("A", now, edgeTime);
        assertThat(service.snapshot("A").state()).isEqualTo("normal");
        assertThat(service.snapshot("A").lastReceivedAt()).isEqualTo(start);
        assertThat(service.snapshot("A").edgeSampledAt()).isEqualTo(edgeTime);
        now = start.plusMillis(2999);
        service.detectDelays();
        verify(publisher, times(1)).publishStatus(any());
        now = start.plusSeconds(3);
        service.detectDelays();
        service.detectDelays();
        now = start.plusSeconds(20);
        service.detectDelays();
        assertThat(service.snapshot("A").state()).isEqualTo("delayed");
        verify(publisher, times(2)).publishStatus(any());
        verify(persistence, times(1)).persistEvent(argThat(event -> event.eventType().equals("telemetry-delayed")));
        service.recordTelemetry("A", now, start.minusSeconds(3600));
        service.recordTelemetry("A", now, null);
        service.detectDelays();
        assertThat(service.snapshot("A").state()).isEqualTo("normal");
        assertThat(service.snapshot("A").lastReceivedAt()).isEqualTo(now);
        verify(publisher, times(3)).publishStatus(any());
        verify(persistence, times(1)).persistEvent(argThat(event -> event.eventType().equals("telemetry-recovered")));
        verify(persistence, times(2)).persistEvent(any());
    }

    @Test
    void tracksRobotsIndependently() {
        service.recordTelemetry("A", now, now);
        now = start.plusSeconds(2);
        service.recordTelemetry("B", now, now);
        now = start.plusSeconds(3);
        service.detectDelays();
        assertThat(service.snapshot("A").state()).isEqualTo("delayed");
        assertThat(service.snapshot("B").state()).isEqualTo("normal");
        assertThat(service.snapshot("C").state()).isEqualTo("never-seen");
        now = start.plusSeconds(5);
        service.recordTelemetry("A", now, now);
        service.detectDelays();
        assertThat(service.snapshot("A").state()).isEqualTo("normal");
        assertThat(service.snapshot("B").state()).isEqualTo("delayed");
    }

    @Test
    void edgeStatusHeartbeatCannotRestoreMissingTelemetry() {
        service.recordTelemetry("A", now, now);
        now = start.plusSeconds(3);
        service.recordStatus(new MqttStatusPayload("A", "online", "connected", "connected", now, false));
        service.detectDelays();
        ArgumentCaptor<RobotStatusMessage> messages = ArgumentCaptor.forClass(RobotStatusMessage.class);
        verify(publisher, times(3)).publishStatus(messages.capture());
        RobotStatusMessage last = messages.getValue();
        assertThat(last.connectionState()).isEqualTo("degraded");
        assertThat(last.mqttState()).isEqualTo("connected");
        assertThat(last.telemetryReception().state()).isEqualTo("delayed");
        assertThat(last.telemetryReception().lastReceivedAt()).isEqualTo(start);
        verify(persistence, times(1)).persistEvent(any());
    }

    @Test
    void oldCompletionCannotMoveReceptionTimeBackwards() {
        now = start.plusSeconds(2);
        service.recordTelemetry("A", now, now);
        service.recordTelemetry("A", start, start);
        assertThat(service.snapshot("A").lastReceivedAt()).isEqualTo(now);
    }

    @Test
    void robotListExposesNeverSeenAndDelayedSnapshotWithoutNewMessages() {
        var repository = mock(com.autonomousmower.robot.repository.RobotRepository.class);
        when(repository.findAll()).thenReturn(java.util.List.of(
                new com.autonomousmower.robot.entity.Robot("A", "test", java.time.LocalDateTime.of(2026, 9, 10, 0, 0)),
                new com.autonomousmower.robot.entity.Robot("B", "test", java.time.LocalDateTime.of(2026, 9, 10, 0, 0))));
        var robots = new com.autonomousmower.robot.service.RobotService(repository, service);
        service.recordTelemetry("A", now, now.minusSeconds(50));
        now = start.plusSeconds(3);
        assertThat(robots.findAll().get(0).telemetryReception().state()).isEqualTo("delayed");
        assertThat(robots.findAll().get(1).telemetryReception().state()).isEqualTo("never-seen");
    }
}
