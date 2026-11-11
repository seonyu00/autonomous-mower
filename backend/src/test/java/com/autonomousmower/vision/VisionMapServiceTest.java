package com.autonomousmower.vision;

import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.workzone.service.GeoJsonPolygonMapper;
import com.autonomousmower.workzone.dto.*;
import com.autonomousmower.common.exception.BusinessException;
import java.time.Instant;
import java.util.List;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.flywaydb.core.Flyway;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="VISION_TEST_DB_URL", matches=".+")
class VisionMapServiceTest {
    JdbcTemplate jdbc;
    VisionMapService service;
    TransactionTemplate tx;
    @BeforeEach void setup() {
        String url = System.getenv("VISION_TEST_DB_URL");
        if (!url.matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/vision_test")) throw new IllegalStateException("격리 DB만 사용함");
        var ds = new DriverManagerDataSource(url, "postgres", "vision-test-only");
        Flyway.configure().dataSource(ds).load().migrate();
        jdbc = new JdbcTemplate(ds); tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.update("DELETE FROM vision_observation");
        jdbc.update("DELETE FROM work_zone WHERE robot_id='VISION-TEST'");
        jdbc.update("INSERT INTO robot(robot_id,model_name,created_at) VALUES('VISION-TEST','test',now()) ON CONFLICT DO NOTHING");
        jdbc.update("INSERT INTO work_zone(robot_id,zone_polygon,version,created_at,updated_at) VALUES('VISION-TEST',ST_GeomFromText('POLYGON((127 37,127.01 37,127.01 37.01,127 37.01,127 37))',4326),1,now(),now())");
        service = new VisionMapService(jdbc, mock(RobotService.class), new GeoJsonPolygonMapper());
    }
    WorkZonePayload area(double x0, double x1) {
        return new WorkZonePayload("Polygon",4326,new GeoJsonGeometryDto("Polygon",List.of(List.of(
                List.of(x0,37.0),List.of(x1,37.0),List.of(x1,37.005),List.of(x0,37.005),List.of(x0,37.0)))));
    }
    void record(String id, Instant at, VisionMapService.State state, WorkZonePayload shape) {
        tx.executeWithoutResult(s -> service.record("VISION-TEST",new VisionMapService.Input(id,1,at,state,"test-fixture",shape)));
    }
    VisionMapService.Snapshot snapshot() { return tx.execute(s -> service.snapshot("VISION-TEST",1,null)); }

    @Test void overlapsKeepLatestPartsAndDangerHistoryAndRejectReplayConflict() throws Exception {
        Instant now = Instant.now().minusSeconds(10);
        record("danger",now,VisionMapService.State.DANGEROUS,area(127,127.006));
        record("new",now.plusSeconds(1),VisionMapService.State.MOW_NOW,area(127.003,127.009));
        record("old",now.minusSeconds(1),VisionMapService.State.UNKNOWN,area(127,127.009));
        var result = snapshot();
        assertThat(result.regions()).hasSize(2);
        assertThat(result.dangerHistory()).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vision_observation a JOIN vision_observation b ON a.id<b.id WHERE ST_Area(ST_Intersection(a.current_geometry,b.current_geometry))>0",Integer.class)).isZero();
        record("new",now.plusSeconds(1),VisionMapService.State.MOW_NOW,area(127.003,127.009));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vision_observation",Integer.class)).isEqualTo(3);
        assertThatThrownBy(() -> record("new",now.plusSeconds(1),VisionMapService.State.UNKNOWN,area(127.003,127.009))).isInstanceOf(BusinessException.class);
        assertThat(snapshot().regions()).hasSize(2);
        var json = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        assertThat(json.readTree(json.writeValueAsString(result)).at("/regions/0/geometry/type").asText()).isEqualTo("Polygon");
    }
    @Test void staleRetentionAndZoneVersionsRemainSeparate() {
        record("stale",Instant.now().minusSeconds(301),VisionMapService.State.DANGEROUS,area(127,127.005));
        assertThat(snapshot().regions().getFirst().stale()).isTrue();
        jdbc.update("UPDATE vision_observation SET received_at=now()-interval '31 days'");
        assertThat(snapshot().dangerHistory()).isEmpty();
        tx.executeWithoutResult(s -> service.expireDangerHistory());
        assertThat(snapshot().regions()).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vision_observation WHERE danger_geometry IS NOT NULL",Integer.class)).isZero();
        jdbc.update("UPDATE work_zone SET version=2 WHERE robot_id='VISION-TEST'");
        assertThatThrownBy(this::snapshot).isInstanceOf(BusinessException.class);
        assertThat(tx.execute(s -> service.snapshot("VISION-TEST",2,null)).regions()).isEmpty();
    }
    @Test void clipsBoundaryAndRejectsFutureAndOutside() {
        record("clipped",Instant.now().minusSeconds(1),VisionMapService.State.UNKNOWN,area(126.999,127.003));
        assertThat(jdbc.queryForObject("SELECT bool_and(ST_CoveredBy(current_geometry,zone_polygon)) FROM vision_observation JOIN work_zone USING(robot_id)",Boolean.class)).isTrue();
        assertThatThrownBy(() -> record("future",Instant.now().plusSeconds(60),VisionMapService.State.UNKNOWN,area(127,127.003))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> record("outside",Instant.now().minusSeconds(1),VisionMapService.State.UNKNOWN,area(125,125.1))).isInstanceOf(BusinessException.class);
    }
    @Test void supersededNonDangerKeepsOnlyReplayIdentityAndHistoryPages() {
        Instant time = Instant.now().minusSeconds(20);
        record("first",time,VisionMapService.State.MOW_NOW,area(127,127.005));
        record("second",time.plusSeconds(1),VisionMapService.State.UNKNOWN,area(127,127.005));
        assertThat(jdbc.queryForObject("SELECT state IS NULL AND observed_at IS NULL AND source IS NULL FROM vision_observation WHERE observation_id='first'",Boolean.class)).isTrue();
        record("first",time,VisionMapService.State.MOW_NOW,area(127,127.005));
        assertThat(snapshot().regions().getFirst().observationId()).isEqualTo("second");
        jdbc.update("INSERT INTO vision_observation(robot_id,observation_id,zone_version,observed_at,received_at,state,source,fingerprint,danger_geometry) SELECT 'VISION-TEST','history-'||n,1,now(),now(),'DANGEROUS','fixture','test',ST_GeomFromText('POLYGON((127 37,127.001 37,127.001 37.001,127 37.001,127 37))',4326) FROM generate_series(1,101) n");
        var first = snapshot();
        assertThat(first.dangerHistory()).hasSize(100);
        var next = tx.execute(s -> service.snapshot("VISION-TEST",1,first.nextHistoryCursor()));
        assertThat(next.dangerHistory()).hasSize(1);
        assertThat(first.dangerHistory()).extracting(VisionMapService.Region::id).doesNotContain(next.dangerHistory().getFirst().id());
    }
}
