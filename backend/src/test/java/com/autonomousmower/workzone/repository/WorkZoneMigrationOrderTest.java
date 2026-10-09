package com.autonomousmower.workzone.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;

// 명시한 로컬 테스트 DB에 새 스키마를 만들며 기존 테이블은 건드리지 않는다.
@EnabledIfEnvironmentVariable(named = "WORK_ZONE_TEST_JDBC_URL",
        matches = "jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/mower_workzone_test")
class WorkZoneMigrationOrderTest {
    @TempDir Path migrations;
    String schema;
    Connection connection;

    @BeforeEach
    void applyReleasedMigrationsWithoutV8() throws Exception {
        schema = "zone_order_" + UUID.randomUUID().toString().replace("-", "");
        connection = DriverManager.getConnection(System.getenv("WORK_ZONE_TEST_JDBC_URL"),
                System.getenv("WORK_ZONE_TEST_DB_USER"), System.getenv("WORK_ZONE_TEST_DB_PASSWORD"));
        try (var files = Files.list(Path.of("src/main/resources/db/migration"))) {
            for (Path file : files.toList()) {
                if (!file.getFileName().toString().startsWith("V8__")) {
                    Files.copy(file, migrations.resolve(file.getFileName()));
                }
            }
        }
        flyway(false).migrate();
        sql("SET search_path TO " + schema + ", public");
        sql("INSERT INTO robot(robot_id,model_name,created_at) VALUES ('order-test','PC 검증',CURRENT_TIMESTAMP)");
        sql("INSERT INTO work_zone(robot_id,zone_polygon,version,created_at,updated_at) "
                + "VALUES ('order-test',ST_GeomFromText('POLYGON((127 37,128 37,128 38,127 37))',4326),"
                + "4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        Path v8 = Path.of("src/main/resources/db/migration/V8__enforce_one_work_zone_per_robot.sql");
        Files.copy(v8, migrations.resolve(v8.getFileName()));
    }

    @AfterEach
    void removeOnlyOwnSchema() throws Exception {
        if (connection != null) {
            try {
                sql("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
            } finally {
                connection.close();
            }
        }
    }

    @Test
    void addingV8AfterV9RequiresExplicitOneTimeOutOfOrder() throws Exception {
        String originalZone = zoneRow();
        assertThatThrownBy(() -> flyway(false).migrate())
                .isInstanceOf(FlywayException.class).hasMessageContaining("8");
        assertThat(number("SELECT COUNT(*) FROM work_zone WHERE robot_id='order-test'")).isEqualTo(1);
        assertThat(number("SELECT version FROM work_zone WHERE robot_id='order-test'")).isEqualTo(4);
        assertThat(number("SELECT COUNT(*) FROM flyway_schema_history WHERE version='8'")).isZero();

        assertThat(flyway(true).migrate().migrationsExecuted).isEqualTo(1);
        flyway(false).validate();
        assertThat(flyway(false).migrate().migrationsExecuted).isZero();
        assertThat(number("SELECT version FROM work_zone WHERE robot_id='order-test'")).isEqualTo(4);
        assertThat(number("SELECT COUNT(*) FROM work_zone WHERE robot_id='order-test'")).isEqualTo(1);
        assertThat(number("SELECT COUNT(*) FROM pg_constraint WHERE conrelid='work_zone'::regclass "
                + "AND conname='uq_work_zone_robot_id'")).isEqualTo(1);
        assertThat(number("SELECT COUNT(*) FROM account_management_guard")).isEqualTo(1);
        assertThat(zoneRow()).isEqualTo(originalZone);
    }

    @Test
    void duplicateZonesAbortV8WithoutDeletingDataOrApplyingConstraint() throws Exception {
        sql("INSERT INTO work_zone(robot_id,zone_polygon,version,created_at,updated_at) "
                + "SELECT robot_id,zone_polygon,version,created_at,updated_at FROM work_zone WHERE robot_id='order-test'");
        assertThatThrownBy(() -> flyway(true).migrate())
                .isInstanceOf(FlywayException.class).hasMessageContaining("duplicate robot_id");
        assertThat(number("SELECT COUNT(*) FROM work_zone WHERE robot_id='order-test' AND version=4")).isEqualTo(2);
        assertThat(number("SELECT COUNT(*) FROM flyway_schema_history WHERE version='8'")).isZero();
        assertThat(number("SELECT COUNT(*) FROM pg_constraint WHERE conrelid='work_zone'::regclass "
                + "AND conname='uq_work_zone_robot_id'")).isZero();
    }

    private Flyway flyway(boolean outOfOrder) {
        return Flyway.configure().dataSource(System.getenv("WORK_ZONE_TEST_JDBC_URL"),
                        System.getenv("WORK_ZONE_TEST_DB_USER"), System.getenv("WORK_ZONE_TEST_DB_PASSWORD"))
                .schemas(schema).defaultSchema(schema)
                .locations("filesystem:" + migrations.toAbsolutePath()).outOfOrder(outOfOrder).load();
    }

    private void sql(String statement) throws Exception {
        try (var command = connection.createStatement()) { command.execute(statement); }
    }

    private long number(String query) throws Exception {
        try (var command = connection.createStatement(); var result = command.executeQuery(query)) {
            result.next();
            return result.getLong(1);
        }
    }

    private String zoneRow() throws Exception {
        try (var command = connection.createStatement(); var result = command.executeQuery(
                "SELECT row_to_json(w)::text FROM work_zone w WHERE robot_id='order-test'")) {
            result.next();
            return result.getString(1);
        }
    }
}
