package com.autonomousmower.mqtt.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MqttInboundPersistenceServiceTest {

    @Mock
    private RobotRepository robotRepository;

    @Mock
    private TelemetryLogRepository telemetryLogRepository;

    @Mock
    private RobotEventRepository robotEventRepository;

    private MqttInboundPersistenceService persistenceService;
    private final Robot robot = new Robot("MOWER-01", "Orin NX Model-A", LocalDateTime.parse("2026-05-30T00:00:00"));

    @BeforeEach
    void setUp() {
        persistenceService = new MqttInboundPersistenceService(
                robotRepository,
                telemetryLogRepository,
                robotEventRepository,
                Clock.fixed(Instant.parse("2026-05-31T01:00:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void telemetryPayloadIsStoredAsTelemetryLogWithServerTimeAndPoint4326() {
        MqttTelemetryPayload payload = telemetry("MOWER-01");
        when(robotRepository.findById("MOWER-01")).thenReturn(Optional.of(robot));

        boolean persisted = persistenceService.persistTelemetry(payload);

        assertThat(persisted).isTrue();
        ArgumentCaptor<TelemetryLog> captor = ArgumentCaptor.forClass(TelemetryLog.class);
        verify(telemetryLogRepository).save(captor.capture());
        TelemetryLog saved = captor.getValue();
        assertThat(saved.getRobot()).isSameAs(robot);
        assertThat(saved.getLocationPoint().getX()).isEqualTo(127.0001);
        assertThat(saved.getLocationPoint().getY()).isEqualTo(37.5001);
        assertThat(saved.getLocationPoint().getSRID()).isEqualTo(4326);
        assertThat(saved.getBatteryLevel()).isEqualTo(82);
        assertThat(saved.getRobotState()).isEqualTo("MOWING");
        assertThat(saved.getRecordedAt()).isEqualTo(LocalDateTime.parse("2026-05-31T01:00:00"));
    }

    @Test
    void unknownRobotTelemetryIsRejectedWithoutSaving() {
        MqttTelemetryPayload payload = telemetry("UNKNOWN");
        when(robotRepository.findById("UNKNOWN")).thenReturn(Optional.empty());

        boolean persisted = persistenceService.persistTelemetry(payload);

        assertThat(persisted).isFalse();
        verify(telemetryLogRepository, never()).save(org.mockito.Mockito.any());
        verify(robotEventRepository, never()).save(org.mockito.Mockito.any());
    }

    @Test
    void eventPayloadIsStoredAsRobotEvent() {
        MqttEventPayload payload = new MqttEventPayload(
                "event-001",
                "MOWER-01",
                "warning",
                "obstacle-detected",
                "Obstacle detected.",
                Instant.parse("2026-05-31T00:59:30Z"),
                "edge-mock"
        );
        when(robotRepository.findById("MOWER-01")).thenReturn(Optional.of(robot));

        boolean persisted = persistenceService.persistEvent(payload);

        assertThat(persisted).isTrue();
        ArgumentCaptor<RobotEvent> captor = ArgumentCaptor.forClass(RobotEvent.class);
        verify(robotEventRepository).save(captor.capture());
        assertThat(captor.getValue().getEventId()).isEqualTo("event-001");
        assertThat(captor.getValue().getRobot()).isSameAs(robot);
        assertThat(captor.getValue().getSeverity()).isEqualTo("warning");
        assertThat(captor.getValue().getEventType()).isEqualTo("obstacle-detected");
        assertThat(captor.getValue().getOccurredAt()).isEqualTo(LocalDateTime.parse("2026-05-31T00:59:30"));
    }

    @Test
    void statusPayloadIsStoredAsInfoOrWarningEvent() {
        MqttStatusPayload payload = new MqttStatusPayload(
                "MOWER-01",
                "degraded",
                "connected",
                "connected",
                Instant.parse("2026-05-31T00:59:45Z"),
                true
        );
        when(robotRepository.findById("MOWER-01")).thenReturn(Optional.of(robot));

        boolean persisted = persistenceService.persistStatus(payload);

        assertThat(persisted).isTrue();
        ArgumentCaptor<RobotEvent> captor = ArgumentCaptor.forClass(RobotEvent.class);
        verify(robotEventRepository).save(captor.capture());
        assertThat(captor.getValue().getEventType()).isEqualTo("status-update");
        assertThat(captor.getValue().getSeverity()).isEqualTo("warning");
        assertThat(captor.getValue().getOccurredAt()).isEqualTo(LocalDateTime.parse("2026-05-31T01:00:00"));
    }

    private MqttTelemetryPayload telemetry(String robotId) {
        return new MqttTelemetryPayload(
                robotId,
                37.5001,
                127.0001,
                82,
                "manual",
                "mowing",
                0.4,
                92,
                Instant.parse("2026-05-31T00:59:59Z"),
                null
        );
    }
}
