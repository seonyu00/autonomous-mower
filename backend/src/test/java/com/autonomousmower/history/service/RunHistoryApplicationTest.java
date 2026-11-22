package com.autonomousmower.history.service;

import static org.assertj.core.api.Assertions.assertThat;
import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.autonomousmower.history.dto.RunSignal;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.*;
import java.util.Map;
import java.util.UUID;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
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
    private static final Path REPLAY_DIR = Path.of(System.getProperty("java.io.tmpdir"),
            "mower-replay-test-" + UUID.randomUUID());

    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("RUN_TEST_JDBC_URL"));
        p.add("spring.datasource.username",()->System.getenv("RUN_TEST_USER"));
        p.add("spring.datasource.password",()->System.getenv("RUN_TEST_PASSWORD"));
        p.add("app.snapshot.storage-path",()->System.getProperty("java.io.tmpdir")+"/mower-run-test-snapshots");
        p.add("app.history.replay-directory", REPLAY_DIR::toString);
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
        var replayFile = REPLAY_DIR.resolve(id + ".jsonl.gz");
        robots.saveAndFlush(new Robot(robotId,"PC 모의 작업",LocalDateTime.now()));
        admins.saveAndFlush(new Admin(accountId,passwords.encode(password),keep ? "read-only" : "admin",LocalDateTime.now()));
        try {
            var login=http.postForEntity("/api/auth/login",Map.of("adminId",accountId,"password",password),String.class);
            assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
            var token=mapper.readTree(login.getBody()).path("data").path("accessToken").asText();
            var headers=new HttpHeaders(); headers.setBearerAuth(token);
            http.getRestTemplate().setRequestFactory(new org.springframework.http.client.JdkClientHttpRequestFactory());
            var lifecycle = "/api/history/runs/" + id + "/lifecycle?robotId=" + robotId;
            var start = new RunSignal(UUID.randomUUID(),id,robotId,"start",at,null,null);
            var end = new RunSignal(UUID.randomUUID(),id,robotId,"end",at.plusSeconds(5),null,null);
            var startRequest = new HttpEntity<>(Map.of("id", start.id(), "kind", start.kind(), "signalAt", start.signalAt().toString()), headers);
            var endRequest = new HttpEntity<>(Map.of("id", end.id(), "kind", end.kind(), "signalAt", end.signalAt().toString()), headers);
            if (keep) {
                assertThat(persistence.persist(start, at)).isTrue();
            } else {
                assertThat(http.exchange(lifecycle, HttpMethod.PUT, endRequest, Void.class).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT);
                assertThat(http.exchange(lifecycle, HttpMethod.PUT, startRequest, Void.class).getStatusCode())
                        .isEqualTo(HttpStatus.NO_CONTENT);
                assertThat(http.exchange(lifecycle, HttpMethod.PUT, startRequest, Void.class).getStatusCode())
                        .isEqualTo(HttpStatus.NO_CONTENT);
            }
            for(int second:new int[]{0,1,4,5}) {
                double longitude=127.454+(second<2?second*0.001:0.010+(second-4)*0.001);
                assertThat(persistence.persist(new RunSignal(UUID.randomUUID(),id,robotId,"gps",at.plusSeconds(second),36.626,longitude),at.plusSeconds(second))).isTrue();
            }
            if (keep) {
                assertThat(persistence.persist(end, at.plusSeconds(5))).isTrue();
            } else {
                assertThat(http.exchange(lifecycle, HttpMethod.PUT, endRequest, Void.class).getStatusCode())
                        .isEqualTo(HttpStatus.NO_CONTENT);
            }
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
            var replayUrl = "/api/history/runs/" + id + "/replay";
            assertThat(http.exchange(replayUrl + "?robotId=" + robotId, HttpMethod.GET,
                    new HttpEntity<>(headers), byte[].class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

            Files.createDirectories(REPLAY_DIR);
            byte[] log = """
                    {"type":"run_start","schema":"mower.mission.log.v1","dry_run":false,"server_run_id":"%s"}
                    {"type":"step","step":1}
                    {"type":"run_end"}
                    """.formatted(id).getBytes(StandardCharsets.UTF_8);
            var compressed = new java.io.ByteArrayOutputStream();
            try (var gzip = new GZIPOutputStream(compressed)) {
                gzip.write(log);
            }
            // HTTP 클라이언트의 자동 압축 해제를 피하고 실제 응답의 인코딩을 검사한다.
            if (keep) {
                Files.write(replayFile, compressed.toByteArray());
            } else {
                headers.setContentType(MediaType.parseMediaType("application/gzip"));
                var upload = new HttpEntity<>(compressed.toByteArray(), headers);
                String path = replayUrl + "?robotId=" + robotId;
                assertThat(http.exchange(path, HttpMethod.PUT, new HttpEntity<>(new byte[]{1}, headers),
                        Void.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(http.exchange(path, HttpMethod.PUT, upload, Void.class).getStatusCode())
                        .isEqualTo(HttpStatus.NO_CONTENT);
                assertThat(http.exchange(path, HttpMethod.PUT, upload, Void.class).getStatusCode())
                        .isEqualTo(HttpStatus.NO_CONTENT);
            }
            var replay = http.exchange(replayUrl + "?robotId=" + robotId, HttpMethod.GET,
                    new HttpEntity<>(headers), byte[].class);
            assertThat(replay.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(replay.getHeaders().getFirst(HttpHeaders.CONTENT_ENCODING)).isEqualTo("gzip");
            try (var gzip = new GZIPInputStream(new ByteArrayInputStream(replay.getBody()))) {
                assertThat(gzip.readAllBytes()).isEqualTo(log);
            }
            assertThat(http.exchange(replayUrl + "?robotId=another-robot", HttpMethod.GET,
                    new HttpEntity<>(headers), byte[].class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(http.getForEntity(replayUrl + "?robotId=" + robotId, byte[].class).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
            System.out.println("RUN_HTTP_OK robot="+robotId+" distance="+run.path("distanceMeters")+" retained="+keep);
        } finally {
            Files.deleteIfExists(replayFile);
            Files.deleteIfExists(REPLAY_DIR);
            if(!keep) {
                jdbc.update("DELETE FROM stored_run_signal WHERE run_id=?",id);
                jdbc.update("DELETE FROM autonomous_run_position WHERE run_id=?",id);
                jdbc.update("DELETE FROM autonomous_run WHERE id=?",id);
                admins.deleteById(accountId); robots.deleteById(robotId);
            }
        }
    }
}
