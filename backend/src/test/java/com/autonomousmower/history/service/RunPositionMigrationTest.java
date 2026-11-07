package com.autonomousmower.history.service;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;

@EnabledIfEnvironmentVariable(named="RUN_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/mower_run_test")
class RunPositionMigrationTest {
    @Test void upgradePreservesExistingCoordinatesAndNumbersEachRunIndependently() {
        var source=new DriverManagerDataSource(System.getenv("RUN_TEST_JDBC_URL"),
                System.getenv("RUN_TEST_USER"),System.getenv("RUN_TEST_PASSWORD"));
        var jdbc=new JdbcTemplate(source);
        var schema="run_position_upgrade_"+UUID.randomUUID().toString().replace("-","");
        var config=Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema);
        try {
            config.target("13").load().migrate();
            jdbc.execute("INSERT INTO "+schema+".robot(robot_id,model_name,created_at) VALUES ('upgrade-test','test',CURRENT_TIMESTAMP)");
            var at=Instant.parse("2026-11-07T00:00:00Z");
            var first=UUID.randomUUID(); var second=UUID.randomUUID();
            for(var id:List.of(first,second)) {
                jdbc.update("INSERT INTO "+schema+".autonomous_run(id,robot_id,started_at,last_signal_at,last_observed_at) VALUES (?,'upgrade-test',?,?,?)",
                        id,java.sql.Timestamp.from(at),java.sql.Timestamp.from(at),java.sql.Timestamp.from(at));
                for(int i:new int[]{2,0,1}) jdbc.update("INSERT INTO "+schema+".autonomous_run_position(run_id,measured_at,latitude,longitude) VALUES (?,?,?,?)",
                        id,java.sql.Timestamp.from(at.plusSeconds(i)),i==1?null:36.6,i==1?null:127.4+i*0.000001);
            }
            config.target("latest").load().migrate();
            for(var id:List.of(first,second)) {
                assertThat(jdbc.queryForList("SELECT position_index FROM "+schema+".autonomous_run_position WHERE run_id=? ORDER BY position_index",Integer.class,id))
                        .containsExactly(0,1,2);
                var samples=jdbc.query("SELECT measured_at,latitude,longitude FROM "+schema+".autonomous_run_position WHERE run_id=? ORDER BY position_index",
                        (row,index)->new Sample(row.getTimestamp(1).toInstant(),row.getObject(2,Double.class),row.getObject(3,Double.class)),id);
                assertThat(samples).containsExactly(new Sample(at,36.6,127.4),new Sample(at.plusSeconds(1),null,null),
                        new Sample(at.plusSeconds(2),36.6,127.4+2*0.000001));
            }
        } finally { jdbc.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE"); }
    }
}
