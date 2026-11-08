package com.autonomousmower.workzone.service;

import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.workzone.dto.*;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties={"app.mqtt.enabled=false","app.security.jwt.secret=test-only-travel-zone-application-signing-key"})
@EnabledIfEnvironmentVariable(named="RUN_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/mower_run_test")
class TravelZoneDatabaseTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("RUN_TEST_JDBC_URL"));
        p.add("spring.datasource.username",()->System.getenv("RUN_TEST_USER"));
        p.add("spring.datasource.password",()->System.getenv("RUN_TEST_PASSWORD"));
    }
    @Autowired WorkZoneService service;
    @Autowired RobotRepository robots;
    WorkZonePayload square(double size) {
        return new WorkZonePayload("Polygon",4326,new GeoJsonGeometryDto("Polygon",List.of(List.of(
                List.of(127.,37.),List.of(127.+size,37.),List.of(127.+size,37.+size),List.of(127.,37.+size),List.of(127.,37.)))));
    }
    @Test @Transactional void postgisPersistsBothAreasAndChangesSharedVersion() {
        String id="travel-"+UUID.randomUUID().toString().substring(0,8);
        robots.saveAndFlush(new Robot(id,"test",LocalDateTime.now()));
        var first=service.saveWorkZone(id,new WorkZoneRequest(id,null,square(.001)));
        var second=service.saveTravelZone(id,new WorkZoneRequest(id,first.version(),square(.002)));
        assertThat(second.version()).isGreaterThan(first.version());
        var snapshot=service.getWorkZone(id);
        assertThat(snapshot.zone().geometry().coordinates()).isEqualTo(square(.001).geometry().coordinates());
        assertThat(snapshot.travelZone().geometry().coordinates()).isEqualTo(square(.002).geometry().coordinates());
    }
}
