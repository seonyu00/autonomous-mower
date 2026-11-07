package com.autonomousmower.history.service;

import static org.assertj.core.api.Assertions.assertThat;
import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.autonomousmower.history.dto.RunSignal;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** 격리 DB에서 전체 서버를 시작하며, 명시적으로 선택하면 브라우저용 모의 작업을 보존한다. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
    "app.mqtt.enabled=false", "spring.main.allow-circular-references=false",
    "app.security.jwt.secret=test-only-run-history-application-signing-key"})
@EnabledIfEnvironmentVariable(named="RUN_TEST_JDBC_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/mower_run_test")
class RunHistoryApplicationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("RUN_TEST_JDBC_URL"));
        p.add("spring.datasource.username",()->System.getenv("RUN_TEST_USER"));
        p.add("spring.datasource.password",()->System.getenv("RUN_TEST_PASSWORD"));
        p.add("app.snapshot.storage-path",()->System.getProperty("java.io.tmpdir")+"/mower-run-test-snapshots");
    }
    @Autowired RunSignalPersistence persistence;
    @Autowired RobotRepository robots;
    @Autowired AdminRepository admins;
    @Autowired PasswordEncoder passwords;
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;

    @Test void startsRealServerAndReadsGeneratedRunThroughAuthenticatedHttp() throws Exception {
        var id=UUID.randomUUID();
        var robotId="history-test-"+id.toString().substring(0,8);
        var accountId=robotId;
        var keep="true".equals(System.getenv("RUN_TEST_SEED_BROWSER"));
        var password=UUID.randomUUID().toString();
        if(keep) password=java.util.Objects.requireNonNull(System.getenv("RUN_TEST_BROWSER_PASSWORD"));
        var at=Instant.now().minusSeconds(10).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        robots.saveAndFlush(new Robot(robotId,"PC 모의 작업",LocalDateTime.now()));
        admins.saveAndFlush(new Admin(accountId,passwords.encode(password),"read-only",LocalDateTime.now()));
        try {
            assertThat(persistence.persist(new RunSignal(UUID.randomUUID(),id,robotId,"start",at,null,null),at)).isTrue();
            for(int second:new int[]{0,1,4,5}) {
                double longitude=127.454+(second<2?second*0.001:0.010+(second-4)*0.001);
                assertThat(persistence.persist(new RunSignal(UUID.randomUUID(),id,robotId,"gps",at.plusSeconds(second),36.626,longitude),at.plusSeconds(second))).isTrue();
            }
            assertThat(persistence.persist(new RunSignal(UUID.randomUUID(),id,robotId,"end",at.plusSeconds(5),null,null),at.plusSeconds(5))).isTrue();
            var login=http.postForEntity("/api/auth/login",Map.of("adminId",accountId,"password",password),String.class);
            assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
            var token=mapper.readTree(login.getBody()).path("data").path("accessToken").asText();
            var headers=new HttpHeaders(); headers.setBearerAuth(token);
            var response=http.exchange("/api/history/runs?robotId="+robotId,HttpMethod.GET,new HttpEntity<>(headers),String.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            var run=mapper.readTree(response.getBody()).path("data").get(0);
            assertThat(run.path("status").asText()).isEqualTo("completed");
            assertThat(run.path("routeSegments").size()).isEqualTo(2);
            assertThat(run.path("hasGpsGap").asBoolean()).isTrue();
            assertThat(run.path("distancePartial").asBoolean()).isTrue();
            assertThat(run.path("distanceMeters").asDouble()).isBetween(178.0,180.0);
            assertThat(run.path("coveragePercent").isNull()).isTrue();
            assertThat(http.getForEntity("/api/history/runs?robotId="+robotId,String.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            System.out.println("RUN_HTTP_OK robot="+robotId+" distance="+run.path("distanceMeters")+" retained="+keep);
        } finally {
            if(!keep) {
                jdbc.update("DELETE FROM stored_run_signal WHERE run_id=?",id);
                jdbc.update("DELETE FROM autonomous_run_position WHERE run_id=?",id);
                jdbc.update("DELETE FROM autonomous_run WHERE id=?",id);
                admins.deleteById(accountId); robots.deleteById(robotId);
            }
        }
    }
}
