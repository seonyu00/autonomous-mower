package com.autonomousmower.history.service;

import com.autonomousmower.history.dto.*;
import com.autonomousmower.history.entity.AutonomousRun;
import com.autonomousmower.history.repository.AutonomousRunRepository;
import com.autonomousmower.workzone.dto.WorkZonePayload;
import com.autonomousmower.workzone.service.GeoJsonPolygonMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 장비 수신 경로가 확정된 뒤 연결할 내부 입력이다. 공개 쓰기 API나 제어 명령을 제공하지 않는다. */
@Service
public class MowingAreaService {
    private final AutonomousRunRepository runs;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final GeoJsonPolygonMapper polygons;
    public MowingAreaService(AutonomousRunRepository runs, JdbcTemplate jdbc, ObjectMapper json, GeoJsonPolygonMapper polygons) {
        this.runs = runs; this.jdbc = jdbc; this.json = json; this.polygons = polygons;
    }

    @Transactional
    public void bindPlan(String robotId, UUID runId, UUID planId) {
        requireRun(robotId, runId);
        var plans = jdbc.queryForList("SELECT plan_id FROM route_plan WHERE plan_id = ? AND robot_id = ?", UUID.class, planId, robotId);
        if (plans.isEmpty()) throw new IllegalArgumentException("해당 로봇의 보관 경로가 없습니다.");
        jdbc.update("INSERT INTO run_mowing_context(run_id, plan_id) VALUES (?, ?) ON CONFLICT (run_id) DO NOTHING", runId, planId);
        UUID existing = jdbc.queryForObject("SELECT plan_id FROM run_mowing_context WHERE run_id = ?", UUID.class, runId);
        if (!planId.equals(existing)) throw new IllegalArgumentException("작업 중 구역을 바꿀 수 없습니다. 새 작업으로 연결하세요.");
    }

    @Transactional
    public void accept(BladeObservation sample, Instant observedAt) {
        requireRun(sample.robotId(), sample.runId());
        if (sample.measuredAt().isAfter(observedAt)) throw new IllegalArgumentException("미래 시각의 날 상태입니다.");
        jdbc.update("INSERT INTO blade_observation(id, run_id, robot_id, measured_at, state, evidence) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
                sample.id(), sample.runId(), sample.robotId(), java.sql.Timestamp.from(sample.measuredAt()), sample.state().name(), sample.evidence().name());
        var stored = jdbc.queryForObject("SELECT * FROM blade_observation WHERE id = ?", (rs, row) -> new BladeObservation(
                rs.getObject("id", UUID.class), rs.getObject("run_id", UUID.class), rs.getString("robot_id"), rs.getTimestamp("measured_at").toInstant(),
                BladeObservation.State.valueOf(rs.getString("state")), BladeObservation.Evidence.valueOf(rs.getString("evidence"))), sample.id());
        if (!sample.equals(stored)) throw new IllegalArgumentException("같은 신호 ID의 내용이 다릅니다.");
    }

    public MowingEstimate estimate(AutonomousRun run, Instant checkedAt) {
        var payloads = jdbc.queryForList("SELECT p.payload FROM run_mowing_context c JOIN route_plan p ON p.plan_id = c.plan_id WHERE c.run_id = ? AND p.robot_id = ?",
                String.class, run.getId(), run.getRobotId());
        if (payloads.isEmpty()) return null;
        var observations = jdbc.query("SELECT * FROM blade_observation WHERE run_id = ? AND robot_id = ? ORDER BY measured_at",
                (rs, row) -> new BladeObservation(rs.getObject("id", UUID.class), run.getId(), run.getRobotId(), rs.getTimestamp("measured_at").toInstant(),
                        BladeObservation.State.valueOf(rs.getString("state")), BladeObservation.Evidence.valueOf(rs.getString("evidence"))), run.getId(), run.getRobotId());
        if (observations.isEmpty()) return null;
        try {
            var zone = json.treeToValue(json.readTree(payloads.getFirst()).path("workZone").path("zone"), WorkZonePayload.class);
            return MowingAreaEstimator.calculate(polygons.toPolygon(zone), run.getStartedAt(),
                    run.getEndedAt() == null ? checkedAt : run.getEndedAt(), run.samples(), observations);
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("작업에 고정된 구역을 읽을 수 없습니다.", exception);
        }
    }

    private void requireRun(String robotId, UUID runId) {
        var run = runs.findById(runId).orElseThrow(() -> new IllegalArgumentException("작업 시작이 확인되지 않았습니다."));
        if (!run.getRobotId().equals(robotId)) throw new IllegalArgumentException("작업의 로봇이 다릅니다.");
    }
}
