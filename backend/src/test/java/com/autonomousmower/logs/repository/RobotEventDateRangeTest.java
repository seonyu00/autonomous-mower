package com.autonomousmower.logs.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

// 전체 마이그레이션이 실행되므로 명시적인 로컬 통합 검증 DB만 허용한다.
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@EnabledIfEnvironmentVariable(named = "LOG_TEST_JDBC_URL",
        matches = "jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/mower_pc_integration")
class RobotEventDateRangeTest {
    @Autowired RobotEventRepository events;
    @Autowired RobotRepository robots;
    private Robot robot;
    private String prefix;
    private final LocalDateTime time = LocalDateTime.parse("2040-01-05T10:00:00");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("LOG_TEST_JDBC_URL"));
        properties.add("spring.datasource.username", () -> System.getenv("LOG_TEST_DB_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("LOG_TEST_DB_PASSWORD"));
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @BeforeEach
    void seedOwnEvents() {
        prefix = UUID.randomUUID().toString();
        robot = robots.saveAndFlush(new Robot("log-test-" + prefix, "PC 로그 검증", time));
        events.saveAndFlush(new RobotEvent(prefix + "-info", robot, "info", "test", "정보", time, "test"));
        events.saveAndFlush(new RobotEvent(prefix + "-warning", robot, "warning", "test", "경고", time.plusSeconds(1), "test"));
        events.saveAndFlush(new RobotEvent(prefix + "-outside", robot, "info", "test", "기간 밖", time.minusDays(1), "test"));
    }

    @Test
    void dateRangeWithoutSeverityWorksWithOrWithoutRobot() {
        for (String robotId : new String[]{null, robot.getRobotId()}) {
            assertThat(events.findInDateRange(robotId, null, time, time.plusSeconds(1)))
                    .extracting(RobotEvent::getEventId)
                    .containsExactly(prefix + "-warning", prefix + "-info");
        }
    }

    @Test
    void severityIsCaseInsensitiveAndDateBoundsAreInclusive() {
        assertThat(events.findInDateRange(robot.getRobotId(), "INFO", time, time.plusSeconds(1)))
                .extracting(RobotEvent::getEventId).containsExactly(prefix + "-info");
        assertThat(events.findInDateRange(null, "WARNING", time, time.plusSeconds(1)))
                .extracting(RobotEvent::getEventId).containsExactly(prefix + "-warning");
    }

    @Test
    void eitherDateBoundCanBeOmitted() {
        assertThat(events.findInDateRange(robot.getRobotId(), null, time, null))
                .extracting(RobotEvent::getEventId).containsExactly(prefix + "-warning", prefix + "-info");
        assertThat(events.findInDateRange(robot.getRobotId(), null, null, time.minusSeconds(1)))
                .extracting(RobotEvent::getEventId).containsExactly(prefix + "-outside");
    }
}
