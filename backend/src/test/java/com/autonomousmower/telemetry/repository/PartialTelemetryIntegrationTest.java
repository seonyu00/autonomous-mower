package com.autonomousmower.telemetry.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.telemetry.entity.TelemetryLog;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.autonomousmower.mqtt.service.InboundRecord;
import com.autonomousmower.mqtt.service.MqttInboundPersistenceService;
import com.autonomousmower.telemetry.service.TelemetryErrorHistory;
import com.autonomousmower.logs.repository.RobotEventRepository;
import java.time.Instant;
import java.sql.DriverManager;
import java.time.LocalDateTime;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@DataJpaTest
@org.springframework.context.annotation.Import({MqttInboundPersistenceService.class, TelemetryErrorHistory.class})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@EnabledIfEnvironmentVariable(named = "TELEMETRY_TEST_JDBC_URL",
        matches = "jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/mower_telemetry_integration")
class PartialTelemetryIntegrationTest {
    @Autowired TelemetryLogRepository telemetry;
    @Autowired RobotRepository robots;
    @Autowired TestEntityManager entityManager;
    @Autowired MqttInboundPersistenceService inbound;
    @Autowired RobotEventRepository events;
    private static final String legacyId = "legacy-" + UUID.randomUUID();
    private static String legacyHash;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        String url = System.getenv("TELEMETRY_TEST_JDBC_URL");
        String user = System.getenv("TELEMETRY_TEST_DB_USER");
        String password = System.getenv("TELEMETRY_TEST_DB_PASSWORD");
        // 빈 전용 DB는 V9까지 먼저 만들고, 기존 행을 넣은 뒤 애플리케이션이 V10을 적용한다.
        Flyway.configure().dataSource(url, user, password).target("9").load().migrate();
        try (var connection = DriverManager.getConnection(url, user, password)) {
            try (var statement = connection.prepareStatement(
                    "INSERT INTO robot(robot_id, model_name, enabled, created_at) VALUES (?, 'migration-test', true, CURRENT_TIMESTAMP)")) {
                statement.setString(1, legacyId);
                statement.executeUpdate();
            }
            try (var statement = connection.prepareStatement("""
                    INSERT INTO telemetry_log(robot_id, location_point, battery_level, robot_state, recorded_at)
                    VALUES (?, ST_SetSRID(ST_MakePoint(127, 37.5), 4326), 82, 'MOWING', CURRENT_TIMESTAMP)
                    """)) {
                statement.setString(1, legacyId);
                statement.executeUpdate();
            }
            try (var statement = connection.prepareStatement(
                    "SELECT md5(to_jsonb(t)::text) FROM telemetry_log t WHERE robot_id = ?")) {
                statement.setString(1, legacyId);
                try (var rows = statement.executeQuery()) { rows.next(); legacyHash = rows.getString(1); }
            }
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> password);
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Test
    void migrationPreservesLegacyRows() throws Exception {
        try (var connection = DriverManager.getConnection(System.getenv("TELEMETRY_TEST_JDBC_URL"),
                System.getenv("TELEMETRY_TEST_DB_USER"), System.getenv("TELEMETRY_TEST_DB_PASSWORD"));
             var statement = connection.prepareStatement("""
                     SELECT md5((to_jsonb(t) - 'error_code' - 'ingest_id')::text), error_code FROM telemetry_log t WHERE robot_id = ?
                     """)) {
            statement.setString(1, legacyId);
            try (var rows = statement.executeQuery()) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo(legacyHash);
                assertThat(rows.getString(2)).isNull();
            }
        }
    }

    @Test
    void confirmedTransitionsSurviveReplayAndIgnoreMissingOldOrDifferentObservers() {
        String id = "obs-" + UUID.randomUUID();
        robots.saveAndFlush(new Robot(id, "test", LocalDateTime.now()));
        UUID run = UUID.randomUUID();
        UUID next = UUID.randomUUID();
        String fault = "emergency-stop-active";
        var first = sample(id, run, 1, fault);
        inbound.persist(first);
        inbound.persist(first);
        inbound.persist(sample(id, run, 1, null));
        inbound.persist(sample(id, run, 0, null));
        inbound.persist(sample(id, run, 2, fault));
        inbound.persist(sample(id, null, 3, null));
        inbound.persist(sample(id, run, 4, "unknown-code"));
        inbound.persist(sample(id, next, 5, null));
        entityManager.flush();
        entityManager.clear();
        assertThat(events.findByRobotRobotIdOrderByOccurredAtDesc(id)).hasSize(1);
        inbound.persist(sample(id, next, 6, fault));
        inbound.persist(sample(id, next, 7, null));
        inbound.persist(sample(id, next, 8, null));
        inbound.persist(sample(id, next, 9, fault));
        var history = events.findByRobotRobotIdOrderByOccurredAtDesc(id);
        assertThat(history).extracting(e -> e.getEventType()).containsExactly(fault, "emergency-stop-recovered", fault);
        assertThat(history.get(1).getOccurredAt()).isEqualTo(LocalDateTime.parse("2026-11-07T01:00:07"));
        assertThat(telemetry.findByRobotRobotIdOrderByRecordedAtAsc(id)).hasSize(11);
    }

    private InboundRecord sample(String id, UUID session, int seconds, String error) {
        Instant edge = Instant.parse("2026-11-07T00:00:00Z").plusSeconds(seconds);
        return InboundRecord.telemetry(new MqttTelemetryPayload(id, null, null, null, null, null, null, null,
                edge, error, session), edge.plusSeconds(3600));
    }

    @Test
    void databaseStoresMissingLocationBatteryAndStateAsNull() {
        Robot robot = robots.saveAndFlush(new Robot("partial-" + UUID.randomUUID(), "partial-test", LocalDateTime.now()));
        TelemetryLog missing = telemetry.saveAndFlush(new TelemetryLog(robot, null, null, null, LocalDateTime.now()));
        entityManager.clear();
        TelemetryLog loaded = telemetry.findById(missing.getLogId()).orElseThrow();
        assertThat(loaded.getLocationPoint()).isNull();
        assertThat(loaded.getBatteryLevel()).isNull();
        assertThat(loaded.getRobotState()).isNull();
        TelemetryLog fault = telemetry.saveAndFlush(new TelemetryLog(robot, null, null, "ERROR",
                LocalDateTime.now(), "emergency-stop-active"));
        entityManager.clear();
        assertThat(telemetry.findById(fault.getLogId()).orElseThrow().getErrorCode()).isEqualTo("emergency-stop-active");
    }
}
