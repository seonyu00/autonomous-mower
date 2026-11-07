package com.autonomousmower.history.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import com.autonomousmower.history.repository.AutonomousRunRepository;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({AutonomousRunService.class, RunSignalPersistence.class, AutonomousRunDatabaseTest.Json.class})
@EnabledIfEnvironmentVariable(named = "RUN_TEST_JDBC_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/mower_run_test")
class AutonomousRunDatabaseTest {
    @Autowired AutonomousRunService service;
    @Autowired AutonomousRunRepository runs;
    @Autowired RobotRepository robots;
    @Autowired EntityManager em;
    @MockBean RobotService robotService;
    @MockBean Clock clock;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", () -> System.getenv("RUN_TEST_JDBC_URL"));
        p.add("spring.datasource.username", () -> System.getenv("RUN_TEST_USER"));
        p.add("spring.datasource.password", () -> System.getenv("RUN_TEST_PASSWORD"));
        p.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }
    @Test void migrationPersistenceReloadAndUnknownRecovery() {
        var now = Instant.parse("2026-11-07T00:00:00Z");
        var robot = robots.saveAndFlush(new Robot("run-db-test", "test", LocalDateTime.now()));
        when(robotService.getRobot(robot.getRobotId())).thenReturn(robot);
        when(clock.instant()).thenReturn(now.plusSeconds(30));
        var id = UUID.randomUUID();
        service.start(robot.getRobotId(), id, now, now);
        service.addPosition(robot.getRobotId(), id, new Sample(now, 0.0, 0.0));
        service.addPosition(robot.getRobotId(), id, new Sample(now.plusSeconds(1), 0.0, 0.001));
        em.flush(); em.clear();
        var unknown = service.find(robot.getRobotId(), null, null).getFirst();
        assertThat(unknown.status()).isEqualTo("unconfirmed");
        assertThat(unknown.distanceMeters()).isBetween(111.0, 112.0);
        service.observe(robot.getRobotId(), id, now.plusSeconds(31), now.plusSeconds(31), false);
        em.flush(); em.clear();
        when(clock.instant()).thenReturn(now.plusSeconds(31));
        assertThat(service.find(robot.getRobotId(), null, null).getFirst().status()).isEqualTo("running");
        service.observe(robot.getRobotId(), id, now.plusSeconds(32), now.plusSeconds(32), true);
        em.flush(); em.clear();
        assertThat(service.find(robot.getRobotId(), null, null).getFirst().status()).isEqualTo("completed");
        assertThat(runs.count()).isEqualTo(1);
    }

    @Test void staleDetachedUpdateCannotOverwriteNewObservation() {
        var now = Instant.parse("2026-11-07T00:00:00Z");
        var robot = robots.saveAndFlush(new Robot("run-version-test", "test", LocalDateTime.now()));
        when(robotService.getRobot(robot.getRobotId())).thenReturn(robot);
        var id = UUID.randomUUID();
        service.start(robot.getRobotId(), id, now, now);
        em.flush(); em.clear();
        var stale = runs.findById(id).orElseThrow();
        stale.samples();
        em.detach(stale);
        service.observe(robot.getRobotId(), id, now.plusSeconds(2), now.plusSeconds(2), false);
        em.flush(); em.clear();
        stale.observe(now.plusSeconds(1), now.plusSeconds(1), true);
        assertThatThrownBy(() -> runs.saveAndFlush(stale))
                .isInstanceOf(org.springframework.dao.OptimisticLockingFailureException.class);
    }

    @org.springframework.boot.test.context.TestConfiguration
    static class Json {
        @org.springframework.context.annotation.Bean
        com.fasterxml.jackson.databind.ObjectMapper mapper() {
            return new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        }
    }
    @Autowired RunSignalPersistence signalPersistence;
    @Autowired com.autonomousmower.history.repository.StoredRunSignalRepository signals;

    private com.autonomousmower.history.dto.RunSignal signal(UUID runId, String kind, Instant at) {
        return new com.autonomousmower.history.dto.RunSignal(UUID.randomUUID(), runId, "signal-test", kind, at, null, null);
    }
    private Instant prepareSignals() {
        var now=Instant.parse("2026-11-07T00:00:00Z");
        var robot=robots.saveAndFlush(new Robot("signal-test", "test", LocalDateTime.now()));
        when(robotService.getRobot("signal-test")).thenReturn(robot);
        when(clock.instant()).thenReturn(now);
        return now;
    }
    @Test void endBeforeStartSurvivesReloadExpiresAndReconcilesAfter24Hours() throws Exception {
        var now=prepareSignals(); var id=UUID.randomUUID();
        var end=signal(id,"end",now);
        assertThat(signalPersistence.persist(end,now)).isTrue();
        em.flush(); em.clear();
        assertThat(service.find("signal-test",null,null).getFirst().status()).isEqualTo("pending-start");
        when(clock.instant()).thenReturn(now.plusSeconds(86400));
        assertThat(service.find("signal-test",null,null).getFirst().status()).isEqualTo("start-unconfirmed");
        assertThat(signalPersistence.persist(signal(id,"start",now.minusSeconds(10)),now.plusSeconds(86401))).isTrue();
        em.flush(); em.clear();
        var result=service.find("signal-test",null,null).getFirst();
        assertThat(result.id()).isEqualTo("run-"+id);
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.startedAt()).isEqualTo(now.minusSeconds(10));
        assertThat(result.endedAt()).isEqualTo(now);
        assertThat(signalPersistence.persist(end,now.plusSeconds(90000))).isTrue();
        assertThat(signals.count()).isEqualTo(2);
    }
    @Test void conflictingStartDoesNotInventACompletedJob() throws Exception {
        var now=prepareSignals(); var id=UUID.randomUUID();
        signalPersistence.persist(signal(id,"end",now),now);
        assertThat(signalPersistence.persist(signal(id,"start",now.plusSeconds(1)),now.plusSeconds(1))).isFalse();
        em.flush(); em.clear();
        var result=service.find("signal-test",null,null).getFirst();
        assertThat(result.status()).isEqualTo("conflict");
        assertThat(result.startedAt()).isNull();
        assertThat(result.distanceMeters()).isNull();
    }

    @Test void duplicateIdConflictIsPreservedAndCannotExtendJobObservation() throws Exception {
        var now=prepareSignals(); var id=UUID.randomUUID();
        var start=signal(id,"start",now);
        signalPersistence.persist(start,now);
        assertThat(signalPersistence.persist(start,now.plusSeconds(100))).isTrue();
        em.flush(); em.clear();
        when(clock.instant()).thenReturn(now.plusSeconds(30));
        assertThat(service.find("signal-test",null,null).getFirst().status()).isEqualTo("unconfirmed");
        var changed=new com.autonomousmower.history.dto.RunSignal(start.id(),id,"signal-test","start",now.minusSeconds(1),null,null);
        assertThat(signalPersistence.persist(changed,now.plusSeconds(100))).isFalse();
        em.flush(); em.clear();
        assertThat(service.find("signal-test",null,null).getFirst().status()).isEqualTo("conflict");
        assertThat(signals.count()).isEqualTo(1);
    }

    @org.junit.jupiter.api.io.TempDir java.nio.file.Path spoolDirectory;
    @Test void sqliteRestartReplaysIntoRealPostgresUsingOriginalObservationTimes() throws Exception {
        var now=prepareSignals(); var id=UUID.randomUUID();
        var gateway=mock(com.autonomousmower.mqtt.service.MqttInboundPersistenceService.class);
        when(gateway.persist(any())).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("test outage"));
        var mapper=new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        var end=signal(id,"end",now);
        var first=new com.autonomousmower.mqtt.service.TelemetrySpool(spoolDirectory,mapper,gateway,false);
        first.append(com.autonomousmower.mqtt.service.InboundRecord.run(end,now));
        org.springframework.test.util.ReflectionTestUtils.invokeMethod(first,"drain");
        assertThat(first.recording().state()).isEqualTo("buffered");
        org.springframework.test.util.ReflectionTestUtils.invokeMethod(first,"close");
        doAnswer(call -> {
            var record=call.getArgument(0, com.autonomousmower.mqtt.service.InboundRecord.class);
            return signalPersistence.persist(record.runSignal(),record.observedAt());
        }).when(gateway).persist(any());
        var replay=new com.autonomousmower.mqtt.service.TelemetrySpool(spoolDirectory,mapper,gateway,false);
        try {
            org.springframework.test.util.ReflectionTestUtils.invokeMethod(replay,"drain");
            em.flush(); em.clear();
            assertThat(service.find("signal-test",null,null).getFirst().waitingSince()).isEqualTo(now);
            replay.append(com.autonomousmower.mqtt.service.InboundRecord.run(signal(id,"start",now.minusSeconds(2)),now.plusSeconds(86401)));
            org.springframework.test.util.ReflectionTestUtils.invokeMethod(replay,"drain");
            em.flush(); em.clear();
            assertThat(service.find("signal-test",null,null).getFirst().status()).isEqualTo("completed");
        } finally { org.springframework.test.util.ReflectionTestUtils.invokeMethod(replay,"close"); }
    }
}
