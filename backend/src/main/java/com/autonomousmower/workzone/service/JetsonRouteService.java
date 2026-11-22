package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.robot.service.RobotService;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JetsonRouteService {
    private static final int LIFETIME_SECONDS = 3;
    private static final int FUTURE_TOLERANCE_MS = 500;

    public enum Status {
        @JsonProperty("pending") PENDING,
        @JsonProperty("available") AVAILABLE,
        @JsonProperty("held") HELD,
        @JsonProperty("failed") FAILED,
        @JsonProperty("ended") ENDED,
        @JsonProperty("unreported") UNREPORTED,
        @JsonProperty("stale") STALE
    }

    public record Point(@NotNull @DecimalMin("-90") @DecimalMax("90") Double lat, @NotNull @DecimalMin("-180") @DecimalMax("180") Double lon) {}

    public record OpenSession(@NotNull UUID sessionId, @NotNull @Positive Long workZoneId,
                              @NotNull @Positive Integer workZoneVersion, @NotNull @PositiveOrZero Long expectedGeneration,
                              @NotNull @Pattern(regexp = "preview") String sourceMode) {}

    public record Report(@NotNull @Positive Long generation, @NotNull @Positive Long workZoneId,
                         @NotNull @Positive Integer workZoneVersion, @NotNull @PositiveOrZero Long sequence,
                         @PositiveOrZero Long routeRevision, @NotNull Status status,
                         @NotNull @Pattern(regexp = "[a-z0-9_]{1,64}") String reason,
                         @NotNull Instant statusObservedAt, Instant routeGeneratedAt, Instant observationObservedAt,
                         @NotNull @Size(max = 4000) List<@NotNull @Valid Point> remainingPath) {}

    public record Session(UUID sessionId, long generation) {}

    public record Snapshot(String robotId, long workZoneId, int workZoneVersion, long generation,
                           UUID sessionId, String sourceMode, Long sequence, Long routeRevision,
                           Status status, String reason, Instant statusObservedAt, Instant routeGeneratedAt,
                           Instant observationObservedAt, Instant serverTime, Instant receivedAt,
                           Instant expiresAt, List<Point> remainingPath) {}

    private record Zone(long id, int version) {}
    private record Current(Zone zone, UUID sessionId, long generation, String reportedBy,
                           String payload, Instant receivedAt) {}

    private final RobotService robots;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public JetsonRouteService(RobotService robots, JdbcTemplate jdbc, ObjectMapper json) {
        this.robots = robots;
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional
    public Session open(String robotId, String reporter, OpenSession input) {
        Zone zone = requireZone(robotId, input.workZoneId(), input.workZoneVersion(), true);
        Current current = current(robotId);
        long generation = current == null ? 0 : current.generation();
        if (current != null && current.sessionId().equals(input.sessionId())) {
            if (!zone.equals(current.zone()) || input.expectedGeneration() != generation - 1) throw conflict();
            requireReporter(current, reporter);
            return new Session(current.sessionId(), generation);
        }
        if (input.expectedGeneration() != generation) throw conflict();
        long next = generation + 1;
        jdbc.update("""
                INSERT INTO jetson_route_latest (robot_id, zone_id, zone_version, generation, session_id, reported_by)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (robot_id) DO UPDATE SET zone_id=EXCLUDED.zone_id, zone_version=EXCLUDED.zone_version,
                    generation=EXCLUDED.generation, session_id=EXCLUDED.session_id, reported_by=EXCLUDED.reported_by,
                    report_payload=NULL, received_at=NULL
                """, robotId, zone.id(), zone.version(), next, input.sessionId(), reporter);
        return new Session(input.sessionId(), next);
    }

    @Transactional
    public Snapshot report(String robotId, String reporter, UUID sessionId, Report input) {
        Zone zone = requireZone(robotId, input.workZoneId(), input.workZoneVersion(), true);
        Current current = current(robotId);
        if (current == null || !zone.equals(current.zone()) || !sessionId.equals(current.sessionId())
                || input.generation() != current.generation()) throw conflict();
        requireReporter(current, reporter);
        Instant now = now();
        Report previous = readReport(current);
        if (previous != null) {
            if (input.sequence().equals(previous.sequence())) {
                if (!input.equals(previous)) throw conflict();
                return snapshot(robotId, zone, current, previous, now);
            }
            if (input.sequence() < previous.sequence() || previous.status() == Status.ENDED
                    || (previous.routeRevision() != null && (input.routeRevision() == null
                    || input.routeRevision() < previous.routeRevision()))
                    || input.statusObservedAt().isBefore(previous.statusObservedAt())) throw conflict();
            if (input.status() == Status.AVAILABLE && !input.statusObservedAt().isAfter(previous.statusObservedAt())) {
                throw conflict();
            }
        }
        validate(input, now);
        String payload = encode(input);
        jdbc.update("UPDATE jetson_route_latest SET report_payload=?, received_at=? WHERE robot_id=?",
                payload, Timestamp.from(now), robotId);
        return snapshot(robotId, zone,
                new Current(zone, current.sessionId(), current.generation(), reporter, payload, now), input, now);
    }

    @Transactional
    public Snapshot latest(String robotId, long zoneId, int version) {
        Zone zone = requireZone(robotId, zoneId, version, false);
        Current current = current(robotId);
        return snapshot(robotId, zone, current, readReport(current), now());
    }

    private Zone requireZone(String robotId, long zoneId, int version, boolean writing) {
        robots.getRobot(robotId);
        // 구역 저장과 경로 보고는 같은 작업 구역 행에서 직렬화한다.
        String lock = writing ? " FOR UPDATE" : " FOR SHARE";
        List<Zone> values = jdbc.query("SELECT zone_id, version FROM work_zone WHERE robot_id=?" + lock,
                (rs, row) -> new Zone(rs.getLong("zone_id"), rs.getInt("version")), robotId);
        if (values.isEmpty()) throw new BusinessException(ErrorCode.WORK_ZONE_NOT_FOUND);
        Zone current = values.getFirst();
        if (current.id() != zoneId || current.version() != version) {
            throw new BusinessException(ErrorCode.WORK_ZONE_CONFLICT);
        }
        return current;
    }

    private Current current(String robotId) {
        return jdbc.query("""
                SELECT zone_id, zone_version, session_id, generation, reported_by, report_payload, received_at
                FROM jetson_route_latest WHERE robot_id=?
                """, rs -> {
            if (!rs.next()) return null;
            Timestamp received = rs.getTimestamp("received_at");
            return new Current(new Zone(rs.getLong("zone_id"), rs.getInt("zone_version")),
                    rs.getObject("session_id", UUID.class), rs.getLong("generation"), rs.getString("reported_by"),
                    rs.getString("report_payload"), received == null ? null : received.toInstant());
        }, robotId);
    }

    private void validate(Report input, Instant now) {
        Instant observed = input.statusObservedAt();
        if (observed.isAfter(now.plusMillis(FUTURE_TOLERANCE_MS)) || input.status() == Status.STALE
                || input.status() == Status.UNREPORTED
                || after(input.routeGeneratedAt(), observed) || after(input.observationObservedAt(), observed)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        if (input.status() == Status.AVAILABLE) {
            if (input.remainingPath().size() < 2 || input.routeRevision() == null || input.routeGeneratedAt() == null
                    || input.observationObservedAt() == null || !observed.isAfter(now.minusSeconds(LIFETIME_SECONDS))
                    || !input.observationObservedAt().isAfter(observed.minusSeconds(LIFETIME_SECONDS))
                    || input.remainingPath().stream().anyMatch(point ->
                        !Double.isFinite(point.lat()) || !Double.isFinite(point.lon()))) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST);
            }
        } else if (!input.remainingPath().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    private static boolean after(Instant candidate, Instant limit) {
        return candidate != null && candidate.isAfter(limit);
    }

    private Snapshot snapshot(String robotId, Zone zone, Current current, Report report, Instant now) {
        long generation = current == null ? 0 : current.generation();
        if (current == null || !zone.equals(current.zone())) {
            return new Snapshot(robotId, zone.id(), zone.version(), generation, null, null, null, null,
                    Status.UNREPORTED, null, null, null, null, now, null, null, List.of());
        }
        if (report == null) {
            return new Snapshot(robotId, zone.id(), zone.version(), generation, current.sessionId(),
                    "preview", null, null, Status.PENDING, "waiting_for_path",
                    null, null, null, now, null, null, List.of());
        }
        Instant expires = null;
        Status status = report.status();
        String reason = report.reason();
        if (status == Status.AVAILABLE) {
            Instant base = current.receivedAt().isBefore(report.statusObservedAt())
                    ? current.receivedAt() : report.statusObservedAt();
            expires = base.plusSeconds(LIFETIME_SECONDS);
            if (!now.isBefore(expires)) {
                status = Status.STALE;
                reason = "report_expired";
            }
        }
        return new Snapshot(robotId, zone.id(), zone.version(), generation, current.sessionId(), "preview",
                report.sequence(), report.routeRevision(), status, reason, report.statusObservedAt(),
                report.routeGeneratedAt(), report.observationObservedAt(), now, current.receivedAt(), expires,
                status == Status.AVAILABLE ? report.remainingPath() : List.of());
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }

    private static void requireReporter(Current current, String reporter) {
        if (!current.reportedBy().equals(reporter)) throw new AccessDeniedException("Route session reporter mismatch");
    }

    private static BusinessException conflict() {
        return new BusinessException(ErrorCode.JETSON_ROUTE_CONFLICT);
    }

    private Report readReport(Current current) {
        if (current == null || current.payload() == null) return null;
        try {
            return json.readValue(current.payload(), Report.class);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("저장된 Jetson 경로 보고를 읽을 수 없습니다.", error);
        }
    }

    private String encode(Report input) {
        try {
            return json.writeValueAsString(input);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Jetson 경로 보고를 저장할 수 없습니다.", error);
        }
    }
}
