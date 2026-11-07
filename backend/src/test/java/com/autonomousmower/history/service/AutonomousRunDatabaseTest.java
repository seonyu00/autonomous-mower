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
@Import(AutonomousRunService.class)
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
}
