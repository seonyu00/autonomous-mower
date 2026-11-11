package com.autonomousmower.vision;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.workzone.dto.WorkZonePayload;
import com.autonomousmower.workzone.service.GeoJsonPolygonMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.Duration;
import java.sql.Timestamp;
import java.util.HexFormat;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonRawValue;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.io.WKTReader;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VisionMapService {
    public enum State { MOW_NOW, DANGEROUS, DEFERRED_MOWABLE, NOT_MOWABLE, UNKNOWN }
    public record Input(String observationId, int version, Instant observedAt, State state,
                        String source, WorkZonePayload area) {}
    public record Region(long id, String observationId, int version, State state, String source,
                         Instant observedAt, Instant receivedAt, @JsonRawValue String geometry, boolean stale) {}
    public record Snapshot(String robotId, int version, Instant serverTime, List<Region> regions,
                           List<Region> dangerHistory, Long nextHistoryCursor) {}
    private final JdbcTemplate jdbc;
    private final RobotService robots;
    private final GeoJsonPolygonMapper mapper;

    public VisionMapService(JdbcTemplate jdbc, RobotService robots, GeoJsonPolygonMapper mapper) {
        this.jdbc = jdbc; this.robots = robots; this.mapper = mapper;
    }

    // 실제 수신기는 아직 없다. 테스트와 향후 좌표 검증 어댑터만 이 내부 입력을 사용한다.
    @Transactional
    public void record(String robotId, Input input) {
        robots.getRobot(robotId);
        Instant received = Instant.now();
        if (input == null || input.observationId() == null || input.observationId().isBlank()
                || input.observationId().length() > 128 || input.source() == null || input.source().isBlank()
                || input.source().length() > 128 || input.state() == null || input.observedAt() == null
                || input.observedAt().isAfter(received)) throw invalid();
        Geometry area = mapper.toPolygon(input.area());
        for (var coordinate : area.getCoordinates()) {
            if (!Double.isFinite(coordinate.x) || !Double.isFinite(coordinate.y)) throw invalid();
        }
        var zones = jdbc.queryForList("SELECT version, ST_AsText(zone_polygon) AS wkt FROM work_zone WHERE robot_id=? FOR UPDATE", robotId);
        if (zones.isEmpty()) throw new BusinessException(ErrorCode.WORK_ZONE_NOT_FOUND);
        int version = ((Number) zones.getFirst().get("version")).intValue();
        if (version != input.version()) throw new BusinessException(ErrorCode.WORK_ZONE_CONFLICT);
        String fingerprint = digest(input.observedAt() + "|" + input.version() + "|" + input.state() + "|" + input.source() + "|" + area.toText());
        var previous = jdbc.queryForList("SELECT fingerprint FROM vision_observation WHERE robot_id=? AND observation_id=?", robotId, input.observationId());
        if (!previous.isEmpty()) {
            if (!fingerprint.equals(previous.getFirst().get("fingerprint"))) throw invalid();
            return;
        }
        area = polygonal(area.intersection(geometry((String) zones.getFirst().get("wkt"))));
        if (area.isEmpty() || area.getDimension() != 2 || area.getArea() <= 0) throw invalid();
        // 겹치는 부분만 최신 관측으로 바꾸고, 늦게 온 과거 관측이 최신 영역을 지우지 않게 한다.
        Geometry visible = area;
        var current = jdbc.queryForList("SELECT id, observed_at, ST_AsText(current_geometry) AS wkt FROM vision_observation WHERE robot_id=? AND zone_version=? AND current_geometry IS NOT NULL", robotId, version);
        for (var row : current) {
            Geometry old = geometry((String) row.get("wkt"));
            Instant observed = ((Timestamp) row.get("observed_at")).toInstant();
            if (!observed.isBefore(input.observedAt())) visible = polygonal(visible.difference(old));
            else {
                Geometry remaining = polygonal(old.difference(area));
                jdbc.update("UPDATE vision_observation SET current_geometry=ST_GeomFromText(?,4326) WHERE id=?",
                        remaining.isEmpty() || remaining.getArea() == 0 ? null : remaining.toText(), row.get("id"));
            }
        }
        jdbc.update("""
            INSERT INTO vision_observation(robot_id,observation_id,zone_version,observed_at,received_at,state,source,fingerprint,current_geometry,danger_geometry)
            VALUES(?,?,?,?,?,?,?,?,ST_GeomFromText(?,4326),ST_GeomFromText(?,4326))
            """, robotId, input.observationId(), version, Timestamp.from(input.observedAt()), Timestamp.from(received),
                input.state().name(), input.source(), fingerprint, visible.isEmpty() || visible.getArea() == 0 ? null : visible.toText(),
                input.state() == State.DANGEROUS ? area.toText() : null);
        // 구역 버전이 바뀌면 이전 지도는 이어받지 않고 위험 이력만 별도 보관한다.
        jdbc.update("UPDATE vision_observation SET current_geometry=NULL WHERE robot_id=? AND zone_version<>? AND current_geometry IS NOT NULL", robotId, version);
        compactReceipts(robotId);
    }

    @Transactional
    public Snapshot snapshot(String robotId, int version, Long before) {
        robots.getRobot(robotId);
        var versions = jdbc.queryForList("SELECT version FROM work_zone WHERE robot_id=? FOR SHARE", Integer.class, robotId);
        if (versions.isEmpty()) throw new BusinessException(ErrorCode.WORK_ZONE_NOT_FOUND);
        if (versions.getFirst() != version) throw new BusinessException(ErrorCode.WORK_ZONE_CONFLICT);
        Instant now = Instant.now();
        List<Region> current = rows("current_geometry", "AND zone_version=?", now, robotId, version);
        List<Region> history = rows("danger_geometry", "AND received_at>? AND id<? ORDER BY id DESC LIMIT 101", now,
                robotId, Timestamp.from(now.minus(Duration.ofDays(30))), before == null ? Long.MAX_VALUE : before);
        Long next = history.size() > 100 ? history.get(99).id() : null;
        return new Snapshot(robotId, version, now, current, history.stream().limit(100).toList(), next);
    }

    private List<Region> rows(String column, String condition, Instant now, Object... args) {
        return jdbc.query("SELECT id,observation_id,zone_version,state,source,observed_at,received_at,ST_AsGeoJSON(" + column
                + ") AS geometry FROM vision_observation WHERE robot_id=? AND " + column + " IS NOT NULL " + condition,
                (rs, index) -> new Region(rs.getLong("id"), rs.getString("observation_id"), rs.getInt("zone_version"),
                        State.valueOf(rs.getString("state")), rs.getString("source"), rs.getTimestamp("observed_at").toInstant(),
                        rs.getTimestamp("received_at").toInstant(), rs.getString("geometry"),
                        !rs.getTimestamp("observed_at").toInstant().plusSeconds(300).isAfter(now)), args);
    }

    @Scheduled(fixedDelay = 3600000)
    @Transactional
    public void expireDangerHistory() {
        jdbc.update("UPDATE vision_observation SET danger_geometry=NULL WHERE danger_geometry IS NOT NULL AND received_at<=?",
                Timestamp.from(Instant.now().minus(Duration.ofDays(30))));
        jdbc.update("UPDATE vision_observation v SET current_geometry=NULL FROM work_zone w WHERE v.robot_id=w.robot_id AND v.zone_version<>w.version AND v.current_geometry IS NOT NULL");
        compactReceipts(null);
    }
    private void compactReceipts(String robotId) {
        // 덮인 일반 관측과 만료된 위험은 이력으로 남기지 않고 재전송 식별 정보만 보존한다.
        jdbc.update("UPDATE vision_observation SET state=NULL,source=NULL,observed_at=NULL,received_at=NULL WHERE current_geometry IS NULL AND danger_geometry IS NULL AND state IS NOT NULL AND robot_id=COALESCE(?,robot_id)", robotId);
    }
    private Geometry geometry(String wkt) {
        try { return new WKTReader().read(wkt); } catch (Exception exception) { throw invalid(); }
    }
    private Geometry polygonal(Geometry area) {
        return area.getFactory().buildGeometry(org.locationtech.jts.geom.util.PolygonExtracter.getPolygons(area));
    }
    private String digest(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
    private BusinessException invalid() { return new BusinessException(ErrorCode.INVALID_REQUEST); }
}
