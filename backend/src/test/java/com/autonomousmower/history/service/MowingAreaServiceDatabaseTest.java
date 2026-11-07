package com.autonomousmower.history.service;

import com.autonomousmower.history.dto.*;
import com.autonomousmower.history.entity.AutonomousRun;
import com.autonomousmower.history.repository.AutonomousRunRepository;
import com.autonomousmower.workzone.service.GeoJsonPolygonMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="MOWING_TEST_DB_URL", matches=".+")
class MowingAreaServiceDatabaseTest {
    @Test void persistsEvidenceAndFrozenZoneAndRejectsSignalConflicts() throws Exception {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(System.getenv("MOWING_TEST_DB_URL"), "postgres", System.getenv("MOWING_TEST_DB_PASSWORD")));
        jdbc.execute("CREATE TABLE autonomous_run(id UUID PRIMARY KEY)");
        for (String file : new String[]{"V15__store_route_plan.sql", "V17__store_blade_observations.sql"}) {
            jdbc.execute(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/resources/db/migration/" + file)));
        }
        var repo = mock(AutonomousRunRepository.class);
        var start = Instant.parse("2026-11-07T00:00:00Z");
        UUID runId = UUID.randomUUID(), planId = UUID.randomUUID();
        var run = new AutonomousRun(runId, "R1", start, start);
        run.addPosition(new GpsDistanceCalculator.Sample(start,37.0005,127.0005));
        run.addPosition(new GpsDistanceCalculator.Sample(start.plusSeconds(2),37.0005,127.0006));
        when(repo.findById(runId)).thenReturn(java.util.Optional.of(run));
        jdbc.update("INSERT INTO autonomous_run VALUES (?)",runId);
        String payload = "{\"workZone\":{\"zone\":{\"type\":\"Polygon\",\"srid\":4326,\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[127,37],[127.001,37],[127.001,37.001],[127,37.001],[127,37]]]}}}}";
        jdbc.update("INSERT INTO route_plan(plan_id,robot_id,zone_id,zone_version,payload,sha256) VALUES (?, 'R1',1,2,?,?)",planId,payload,"a".repeat(64));
        var service = new MowingAreaService(repo,jdbc,new ObjectMapper(),new GeoJsonPolygonMapper());
        assertThat(service.estimate(run,start.plusSeconds(2))).isNull();
        service.bindPlan("R1",runId,planId);
        assertThat(service.estimate(run,start.plusSeconds(2))).isNull();
        var observation = new BladeObservation(UUID.randomUUID(),runId,"R1",start,BladeObservation.State.ON,BladeObservation.Evidence.POWER);
        service.accept(observation,start);
        service.accept(observation,start);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM blade_observation",Integer.class)).isEqualTo(1);
        var restarted = new MowingAreaService(repo,jdbc,new ObjectMapper(),new GeoJsonPolygonMapper());
        assertThat(restarted.estimate(run,start.plusSeconds(2)).areaSquareMeters()).isGreaterThan(5);
        assertThat(restarted.estimate(run,start.plusSeconds(2)).evidence()).isEqualTo("power");
        assertThatThrownBy(() -> service.accept(new BladeObservation(observation.id(),runId,"R1",start,BladeObservation.State.OFF,BladeObservation.Evidence.POWER),start))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.accept(new BladeObservation(UUID.randomUUID(),runId,"other",start,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION),start))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.accept(new BladeObservation(UUID.randomUUID(),runId,"R1",start.plusSeconds(1),BladeObservation.State.ON,BladeObservation.Evidence.ROTATION),start))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.bindPlan("other",runId,planId)).isInstanceOf(IllegalArgumentException.class);
    }
}
