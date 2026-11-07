package com.autonomousmower.mqtt.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
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
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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
                robotEventRepository, org.mockito.Mockito.mock(com.autonomousmower.telemetry.service.TelemetryErrorHistory.class)
        );
    }

    @Test
    void telemetryPayloadIsStoredAsTelemetryLogWithServerTimeAndPoint4326() {
        MqttTelemetryPayload payload = telemetry("MOWER-01");
        when(robotRepository.findById("MOWER-01")).thenReturn(Optional.of(robot));

        boolean persisted = persistenceService.persist(InboundRecord.telemetry(payload, Instant.parse("2026-05-31T01:00:00Z")));

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

        boolean persisted = persistenceService.persist(InboundRecord.telemetry(payload, Instant.parse("2026-05-31T01:00:00Z")));

        assertThat(persisted).isFalse();
        verify(telemetryLogRepository, never()).save(org.mockito.Mockito.any());
        verify(robotEventRepository, never()).save(org.mockito.Mockito.any());
    }

    @Test
    void missingMeasurementsRemainNullAndZeroBatteryRemainsMeasured() {
        when(robotRepository.findById("MOWER-01")).thenReturn(Optional.of(robot));
        MqttTelemetryPayload payload = new MqttTelemetryPayload(
                "MOWER-01", null, null, 0, null, null, null, null, Instant.now(), null, null);

        assertThat(persistenceService.persist(InboundRecord.telemetry(payload, Instant.parse("2026-05-31T01:00:00Z")))).isTrue();
        ArgumentCaptor<TelemetryLog> captor = ArgumentCaptor.forClass(TelemetryLog.class);
        verify(telemetryLogRepository).save(captor.capture());
        assertThat(captor.getValue().getLocationPoint()).isNull();
        assertThat(captor.getValue().getRobotState()).isNull();
        assertThat(captor.getValue().getBatteryLevel()).isZero();
        assertThat(captor.getValue().isBatteryCritical()).isTrue();

        TelemetryLog missing = new TelemetryLog(robot, null, null, null, LocalDateTime.now());
        assertThat(missing.isBatteryCritical()).isFalse();
        assertThat(missing.isErrorState()).isFalse();
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

        boolean persisted = persistenceService.persist(InboundRecord.event(payload, payload.occurredAt()));

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

        boolean persisted = persistStatus(payload);

        assertThat(persisted).isTrue();
        ArgumentCaptor<RobotEvent> captor = ArgumentCaptor.forClass(RobotEvent.class);
        verify(robotEventRepository).save(captor.capture());
        assertThat(captor.getValue().getEventType()).isEqualTo("status-update");
        assertThat(captor.getValue().getSeverity()).isEqualTo("warning");
        assertThat(captor.getValue().getOccurredAt()).isEqualTo(LocalDateTime.parse("2026-05-31T01:00:00"));
    }

    private boolean persistStatus(MqttStatusPayload payload) {
        var record = InboundRecord.status(payload, Instant.parse("2026-05-31T01:00:00Z"));
        TransactionSynchronizationManager.initSynchronization();
        try {
            boolean stored = persistenceService.persist(record);
            TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCommit());
            return stored;
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
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
                null, null
        );
    }

    @Test
    void repeatedStatusWithOnlyTimestampChangedDoesNotCreateDuplicateEvents() {
        when(robotRepository.findById("MOWER-01")).thenReturn(Optional.of(robot));
        persistStatus(new MqttStatusPayload(
                "MOWER-01", "online", "connected", "connected", Instant.parse("2026-05-31T00:59:45Z"), false));
        persistStatus(new MqttStatusPayload(
                "MOWER-01", "online", "connected", "connected", Instant.parse("2026-05-31T00:59:48Z"), false));
        verify(robotEventRepository, times(1)).save(org.mockito.Mockito.any());
    }

    @Test
    void statusTransitionsAndOtherRobotsStillCreateEvents() {
        when(robotRepository.findById("MOWER-01")).thenReturn(Optional.of(robot));
        when(robotRepository.findById("MOWER-02")).thenReturn(Optional.of(
                new Robot("MOWER-02", "test", LocalDateTime.parse("2026-05-30T00:00:00"))));
        Instant now = Instant.parse("2026-05-31T00:59:45Z");
        persistStatus(new MqttStatusPayload("MOWER-01", "online", "connected", "connected", now, false));
        persistStatus(new MqttStatusPayload("MOWER-02", "online", "connected", "connected", now, false));
        persistStatus(new MqttStatusPayload("MOWER-01", "degraded", "connected", "connected", now, true));
        persistStatus(new MqttStatusPayload("MOWER-01", "online", "connected", "connected", now, false));
        verify(robotEventRepository, times(4)).save(org.mockito.Mockito.any());
    }

    @Test
    void runSignalUsesOriginalObservationAndDedicatedPersistence() throws Exception {
        var handler=org.mockito.Mockito.mock(com.autonomousmower.history.service.RunSignalPersistence.class);
        org.springframework.test.util.ReflectionTestUtils.setField(persistenceService,"runSignals",handler);
        var now=Instant.parse("2026-11-07T00:00:00Z");
        var signal=new com.autonomousmower.history.dto.RunSignal(java.util.UUID.randomUUID(),java.util.UUID.randomUUID(),
                "test","end",now,null,null);
        when(handler.persist(signal,now)).thenReturn(true);
        assertThat(persistenceService.persist(InboundRecord.run(signal,now))).isTrue();
        verify(handler).persist(signal,now);
        org.mockito.Mockito.verifyNoInteractions(telemetryLogRepository,robotEventRepository);
    }
}
