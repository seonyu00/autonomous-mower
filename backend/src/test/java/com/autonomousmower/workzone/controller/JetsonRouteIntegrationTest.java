package com.autonomousmower.workzone.controller;

import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.mqtt.enabled=false", "app.jetson-route.preview-write-enabled=true",
        "app.security.jwt.secret=jetson-route-isolated-test-signing-key"
})
@EnabledIfEnvironmentVariable(named = "JETSON_ROUTE_TEST_DB_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/jetson_route_test")
class JetsonRouteIntegrationTest {
    private static final String ROBOT = "/api/robots/MOWER-01/jetson-route";
    private static final String PASSWORD = "Route-Test-Only-2026!";
    private static final List<Map<String, Double>> PATH = List.of(
            Map.of("lat", 37.1, "lon", 127.1), Map.of("lat", 37.2, "lon", 127.2));

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("JETSON_ROUTE_TEST_DB_URL"));
        properties.add("spring.datasource.username", () -> "postgres");
        properties.add("spring.datasource.password", () -> "jetson-route-test");
        properties.add("app.snapshot.storage-path", () -> System.getProperty("java.io.tmpdir") + "/mower-route-test-snapshots");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired AdminRepository admins;
    @Autowired PasswordEncoder passwords;
    @Autowired TestRestTemplate http;

    private long zone;
    private HttpHeaders writer;
    private HttpHeaders reader;

    @BeforeEach
    void prepare() {
        http.getRestTemplate().setRequestFactory(new org.springframework.http.client.JdkClientHttpRequestFactory());
        jdbc.update("DELETE FROM jetson_route_latest WHERE robot_id='MOWER-01'");
        jdbc.update("DELETE FROM work_zone WHERE robot_id='MOWER-01'");
        zone = jdbc.queryForObject("""
                INSERT INTO work_zone (robot_id, zone_polygon, version, created_at, updated_at)
                VALUES ('MOWER-01', ST_GeomFromText('POLYGON((127 37,128 37,128 38,127 38,127 37))',4326), 11, now(), now())
                RETURNING zone_id
                """, Long.class);
        writer = login("route-writer", "admin");
        reader = login("route-reader", "read-only");
    }

    @Test
    void maintainsLatestRouteAndExpiresWithoutRefreshingDuplicate() {
        var id = UUID.randomUUID();
        var noReport = data(get(11, reader), HttpStatus.OK);
        assertThat(noReport.path("status").asText()).isEqualTo("unreported");
        assertThat(noReport.path("generation").asLong()).isZero();
        assertThat(data(open(id, 0, 11, writer), HttpStatus.OK).path("generation").asLong()).isEqualTo(1);
        assertThat(data(open(id, 0, 11, writer), HttpStatus.OK).path("generation").asLong()).isEqualTo(1);
        assertThat(data(get(11, reader), HttpStatus.OK).path("status").asText()).isEqualTo("pending");

        Instant time = Instant.now().truncatedTo(ChronoUnit.MILLIS).minusMillis(200);
        var first = report(1, 2, 1, "available", time, PATH);
        var saved = data(put(id, first, writer), HttpStatus.OK);
        var retry = data(put(id, first, writer), HttpStatus.OK);
        assertThat(retry.path("receivedAt")).isEqualTo(saved.path("receivedAt"));
        assertThat(retry.path("expiresAt")).isEqualTo(saved.path("expiresAt"));
        assertThat(saved.path("remainingPath").get(0).path("lat").asDouble()).isEqualTo(37.1);
        assertThat(get(11, reader).getHeaders().getCacheControl()).isEqualTo("no-store");

        var replan = report(1, 3, 2, "available", time.plusMillis(1), List.of(PATH.getLast(), PATH.getFirst()));
        assertThat(data(put(id, replan, writer), HttpStatus.OK).path("remainingPath").get(0).path("lat").asDouble())
                .isEqualTo(37.2);
        assertThat(put(id, first, writer).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        var oldRevision = report(1, 4, 1, "held", time.plusMillis(2), List.of());
        assertThat(put(id, oldRevision, writer).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        var repeatedClock = report(1, 4, 2, "available", time.plusMillis(1), PATH);
        assertThat(put(id, repeatedClock, writer).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

        jdbc.update("UPDATE jetson_route_latest SET received_at=now()-interval '4 seconds' WHERE robot_id='MOWER-01'");
        var expired = data(put(id, replan, writer), HttpStatus.OK);
        assertThat(expired.path("status").asText()).isEqualTo("stale");
        assertThat(expired.path("remainingPath").size()).isZero();
        assertThat(data(get(11, reader), HttpStatus.OK).path("status").asText()).isEqualTo("stale");

        var hold = report(1, 4, 2, "held", time.plusMillis(2), List.of());
        assertThat(data(put(id, hold, writer), HttpStatus.OK).path("remainingPath").size()).isZero();
        var ended = report(1, 5, 2, "ended", time.plusMillis(3), List.of());
        assertThat(data(put(id, ended, writer), HttpStatus.OK).path("status").asText()).isEqualTo("ended");
        assertThat(put(id, report(1, 6, 2, "held", time.plusMillis(3), List.of()), writer).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void concurrentOpenAndZoneChangeFenceOldReports() throws Exception {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = executor.submit(() -> open(first, 0, 11, writer).getStatusCode());
            var b = executor.submit(() -> open(second, 0, 11, writer).getStatusCode());
            assertThat(List.of(a.get(), b.get())).containsExactlyInAnyOrder(HttpStatus.OK, HttpStatus.CONFLICT);
        }
        UUID active = UUID.fromString(data(get(11, reader), HttpStatus.OK).path("sessionId").asText());
        UUID newer = UUID.randomUUID();
        assertThat(data(open(newer, 1, 11, writer), HttpStatus.OK).path("generation").asLong()).isEqualTo(2);
        var late = report(1, 1, 1, "available", Instant.now().minusMillis(100), PATH);
        assertThat(put(active, late, writer).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(open(active, 0, 11, writer).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

        jdbc.update("UPDATE work_zone SET version=12 WHERE robot_id='MOWER-01'");
        assertThat(get(11, reader).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(put(newer, late, writer).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        var current = data(get(12, reader), HttpStatus.OK);
        assertThat(current.path("generation").asLong()).isEqualTo(2);
        assertThat(current.path("status").asText()).isEqualTo("unreported");
        assertThat(current.path("remainingPath").size()).isZero();
        assertThat(data(open(UUID.randomUUID(), 2, 12, writer), HttpStatus.OK).path("generation").asLong())
                .isEqualTo(3);
    }

    @Test
    void enforcesAuthenticationPreviewInputAndSize() {
        var id = UUID.randomUUID();
        assertThat(get(11, new HttpHeaders()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(open(id, 0, 11, reader).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(http.exchange(ROBOT + "/sessions", HttpMethod.POST,
                new HttpEntity<>(Map.of("sessionId", id, "expectedGeneration", 0, "workZoneId", zone,
                        "workZoneVersion", 11, "sourceMode", "follower"), writer), JsonNode.class).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        data(open(id, 0, 11, writer), HttpStatus.OK);
        var invalid = report(1, 0, 1, "available", Instant.now().minusMillis(100), List.of(Map.of("lat", 91.0, "lon", 127.0)));
        assertThat(put(id, invalid, writer).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        var invalidFraction = report(1, 0, 1, "available", Instant.now().minusMillis(100),
                List.of(PATH.getFirst(), Map.of("lat", 90.1, "lon", 127.0)));
        assertThat(put(id, invalidFraction, writer).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        var stale = report(1, 0, 1, "available", Instant.now().minusSeconds(4), PATH);
        assertThat(put(id, stale, writer).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        var tooLarge = http.exchange(ROBOT + "/sessions/" + id + "/latest", HttpMethod.PUT,
                new HttpEntity<>(" ".repeat(256 * 1024 + 1), writer), String.class);
        assertThat(tooLarge.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    }

    private HttpHeaders login(String id, String role) {
        if (admins.findById(id).isEmpty()) {
            admins.saveAndFlush(new Admin(id, passwords.encode(PASSWORD), role, LocalDateTime.now()));
        }
        var response = http.postForEntity("/api/auth/login", Map.of("adminId", id, "password", PASSWORD), JsonNode.class);
        var headers = new HttpHeaders();
        headers.setBearerAuth(data(response, HttpStatus.OK).path("accessToken").asText());
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private static JsonNode data(ResponseEntity<JsonNode> response, HttpStatus expected) {
        assertThat(response.getStatusCode()).withFailMessage("HTTP %s, body=%s", response.getStatusCode(), response.getBody())
                .isEqualTo(expected);
        return response.getBody().path("data");
    }

    private ResponseEntity<JsonNode> get(int version, HttpHeaders headers) {
        return http.exchange(ROBOT + "/latest?workZoneId=" + zone + "&workZoneVersion=" + version,
                HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
    }

    private ResponseEntity<JsonNode> open(UUID id, long generation, int version, HttpHeaders headers) {
        return http.exchange(ROBOT + "/sessions", HttpMethod.POST, new HttpEntity<>(Map.of(
                "sessionId", id, "expectedGeneration", generation, "workZoneId", zone,
                "workZoneVersion", version, "sourceMode", "preview"), headers), JsonNode.class);
    }

    private ResponseEntity<JsonNode> put(UUID id, Map<String, Object> report, HttpHeaders headers) {
        return http.exchange(ROBOT + "/sessions/" + id + "/latest", HttpMethod.PUT,
                new HttpEntity<>(report, headers), JsonNode.class);
    }

    private Map<String, Object> report(long generation, long sequence, long revision, String status, Instant observed,
                                       List<Map<String, Double>> path) {
        var body = new LinkedHashMap<String, Object>();
        body.put("workZoneId", zone);
        body.put("workZoneVersion", 11);
        body.put("generation", generation);
        body.put("sequence", sequence);
        body.put("routeRevision", revision);
        body.put("status", status);
        body.put("reason", "integration_test");
        body.put("statusObservedAt", observed.toString());
        body.put("routeGeneratedAt", observed.minusMillis(1).toString());
        body.put("observationObservedAt", observed.minusMillis(1).toString());
        body.put("remainingPath", path);
        return body;
    }
}
