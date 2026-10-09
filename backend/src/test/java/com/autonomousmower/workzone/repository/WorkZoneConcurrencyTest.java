package com.autonomousmower.workzone.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.workzone.entity.WorkZone;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

// 운영 DB를 사용하지 않고 명시적으로 지정한 로컬 전용 PostgreSQL/PostGIS에서만 실행한다.
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "WORK_ZONE_TEST_JDBC_URL",
        matches = "jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/mower_workzone_test")
class WorkZoneConcurrencyTest {
    @Autowired WorkZoneRepository zones;
    @Autowired RobotRepository robots;
    @Autowired PlatformTransactionManager transactions;
    Robot robot;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("WORK_ZONE_TEST_JDBC_URL"));
        properties.add("spring.datasource.username", () -> System.getenv("WORK_ZONE_TEST_DB_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("WORK_ZONE_TEST_DB_PASSWORD"));
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @BeforeEach
    void createRobot() {
        robot = robots.saveAndFlush(new Robot("test-" + UUID.randomUUID(), "concurrency-test", LocalDateTime.now()));
    }

    @AfterEach
    void removeOwnFixtures() {
        zones.findByRobotRobotId(robot.getRobotId()).ifPresent(zones::delete);
        robots.deleteById(robot.getRobotId());
    }

    @Test
    void twoTransactionsUpdatingTheSameVersionHaveOneWinner() throws Exception {
        zones.saveAndFlush(new WorkZone(robot, polygon(0), LocalDateTime.now()));
        CyclicBarrier bothRead = new CyclicBarrier(2);
        race(() -> {
            WorkZone zone = zones.findByRobotRobotId(robot.getRobotId()).orElseThrow();
            assertThat(zone.getVersion()).isEqualTo(1);
            await(bothRead);
            zone.replacePolygon(polygon(0.1), LocalDateTime.now());
            zones.saveAndFlush(zone);
        });
        assertThat(zones.findByRobotRobotId(robot.getRobotId()).orElseThrow().getVersion()).isEqualTo(2);
    }

    @Test
    void twoTransactionsCreatingTheFirstZoneHaveOneWinner() throws Exception {
        CyclicBarrier bothRead = new CyclicBarrier(2);
        race(() -> {
            assertThat(zones.findByRobotRobotId(robot.getRobotId())).isEmpty();
            await(bothRead);
            zones.saveAndFlush(new WorkZone(robot, polygon(0), LocalDateTime.now()));
        });
        assertThat(zones.findByRobotRobotId(robot.getRobotId())).isPresent();
    }

    private void race(Runnable write) throws Exception {
        Callable<Boolean> transaction = () -> {
            try {
                new TransactionTemplate(transactions).executeWithoutResult(status -> write.run());
                return true;
            } catch (OptimisticLockingFailureException | DataIntegrityViolationException conflict) {
                return false;
            }
        };
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(transaction);
            var second = executor.submit(transaction);
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
    }

    private void await(CyclicBarrier barrier) {
        try { barrier.await(5, TimeUnit.SECONDS); }
        catch (Exception exception) { throw new IllegalStateException(exception); }
    }

    private Polygon polygon(double offset) {
        return new GeometryFactory(new PrecisionModel(), 4326).createPolygon(new Coordinate[]{
                new Coordinate(127, 37), new Coordinate(127.5 + offset, 37),
                new Coordinate(127.5, 37.5), new Coordinate(127, 37)});
    }
}
