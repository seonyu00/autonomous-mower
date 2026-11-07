package com.autonomousmower.history.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import java.time.*;
import java.util.UUID;
import com.autonomousmower.history.dto.RunSignal;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.robot.entity.Robot;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest(properties="spring.jpa.show-sql=false")
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import({AutonomousRunService.class, RunSignalPersistence.class, AutonomousRunDatabaseTest.Json.class})
@Transactional(propagation=Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named="RUN_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/mower_run_test")
class AutonomousRunIncrementalTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("RUN_TEST_JDBC_URL"));
        p.add("spring.datasource.username",()->System.getenv("RUN_TEST_USER"));
        p.add("spring.datasource.password",()->System.getenv("RUN_TEST_PASSWORD"));
        p.add("spring.jpa.hibernate.ddl-auto",()->"validate");
    }
    @Autowired RunSignalPersistence persistence;
    @Autowired RobotRepository robots;
    @Autowired AutonomousRunService service;
    @Autowired JdbcTemplate jdbc;
    @MockBean RobotService robotService;
    @MockBean Clock clock;

    @Test void normalGpsOnlyInsertsNewPositionsAndRetainsReplaySemantics() throws Exception {
        jdbc.execute("CREATE TABLE position_probe (kind text NOT NULL)");
        jdbc.execute("CREATE FUNCTION capture_position_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO position_probe(kind) VALUES (TG_OP); RETURN NULL; END $$");
        jdbc.execute("CREATE TRIGGER position_probe AFTER INSERT OR DELETE ON autonomous_run_position FOR EACH ROW EXECUTE FUNCTION capture_position_probe()");
        var at=Instant.parse("2026-11-07T00:00:00Z");
        var robot=robots.saveAndFlush(new Robot("incremental-test","test",LocalDateTime.now()));
        when(robotService.getRobot(robot.getRobotId())).thenReturn(robot);
        when(clock.instant()).thenReturn(at.plusSeconds(302));
        var id=UUID.randomUUID();
        try {
            persistence.persist(new RunSignal(UUID.randomUUID(),id,robot.getRobotId(),"start",at,null,null),at);
            int begin=1;
            for(int end:new int[]{50,150,300}) {
                long before=System.nanoTime();
                for(int i=begin;i<=end;i++) {
                    var instant=at.plusSeconds(i);
                    assertThat(persistence.persist(new RunSignal(UUID.randomUUID(),id,robot.getRobotId(),"gps",instant,
                            36.6,127.4+i*0.000001),instant)).isTrue();
                }
                System.out.printf("INCREMENTAL from=%d to=%d avg_ms=%.2f%n",begin,end,
                        (System.nanoTime()-before)/1_000_000.0/(end-begin+1));
                begin=end+1;
            }
            assertThat(jdbc.queryForObject("SELECT count(*) FROM position_probe WHERE kind='DELETE'",Long.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM position_probe WHERE kind='INSERT'",Long.class)).isEqualTo(300);
            var beforeEnd=service.find(robot.getRobotId(),null,null).getFirst();
            assertThat(beforeEnd.routeSegments()).hasSize(1);
            assertThat(beforeEnd.hasGpsGap()).isFalse();
            assertThat(beforeEnd.distanceMeters()).isBetween(26.0,27.0);
            var duplicate=new RunSignal(UUID.randomUUID(),id,robot.getRobotId(),"gps",at.plusSeconds(300),36.6,127.4+300*0.000001);
            assertThat(persistence.persist(duplicate,at.plusSeconds(301))).isTrue();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM position_probe WHERE kind='INSERT'",Long.class)).isEqualTo(300);
            assertThat(persistence.persist(new RunSignal(UUID.randomUUID(),id,robot.getRobotId(),"gps",at.plusSeconds(301),null,null),at.plusSeconds(301))).isTrue();
            assertThat(persistence.persist(new RunSignal(UUID.randomUUID(),id,robot.getRobotId(),"end",at.plusSeconds(302),null,null),at.plusSeconds(302))).isTrue();
            var completed=service.find(robot.getRobotId(),null,null).getFirst();
            assertThat(completed.status()).isEqualTo("completed");
            assertThat(completed.routeSegments()).isEqualTo(beforeEnd.routeSegments());
            assertThat(completed.distanceMeters()).isEqualTo(beforeEnd.distanceMeters());
            assertThat(completed.hasGpsGap()).isTrue();
            assertThat(completed.distancePartial()).isTrue();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM position_probe WHERE kind='DELETE'",Long.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM position_probe WHERE kind='INSERT'",Long.class)).isEqualTo(301);
        } finally {
            jdbc.execute("DROP TRIGGER position_probe ON autonomous_run_position");
            jdbc.execute("DROP FUNCTION capture_position_probe()");
            jdbc.execute("DROP TABLE position_probe");
            jdbc.update("DELETE FROM stored_run_signal WHERE run_id=?",id);
            jdbc.update("DELETE FROM autonomous_run_position WHERE run_id=?",id);
            jdbc.update("DELETE FROM autonomous_run WHERE id=?",id);
            robots.deleteById(robot.getRobotId());
        }
    }
}
