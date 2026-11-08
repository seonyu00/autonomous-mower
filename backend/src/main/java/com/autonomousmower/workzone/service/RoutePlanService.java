package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.workzone.dto.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class RoutePlanService {
    public record Envelope(UUID planId, String sha256, String payload) {}
    public record Generated(UUID planId, String sha256, CppPreviewResponse preview) {}
    public record Payload(int formatVersion, String plannerProfile, WorkZoneResponse workZone, CppPreviewResponse preview) {}
    public record Preparation(UUID planId, String sha256, boolean reported, java.time.Instant receivedAt) {}
    private final CppPreviewService previews;
    private final WorkZoneService zones;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public RoutePlanService(CppPreviewService previews, WorkZoneService zones, JdbcTemplate jdbc, ObjectMapper json) {
        this.previews = previews;
        this.zones = zones;
        this.jdbc = jdbc;
        this.json = json;
    }

    public Generated generate(String robotId, CppPreviewRequest request) {
        var preview = previews.preview(robotId, request);
        var zone = zones.getWorkZone(robotId);
        requireVersion(zone, preview.zoneId(), preview.version());
        try {
            String payload = json.writeValueAsString(new Payload(preview.transitPath().isEmpty() ? 1 : 2, preview.transitPath().isEmpty() ? "hd7000w-v1" : "hd7000w-transit-v1", zone, preview));
            if (payload.getBytes(StandardCharsets.UTF_8).length > 2 * 1024 * 1024) {
                throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
            }
            UUID id = UUID.randomUUID();
            String hash = hash(payload);
            jdbc.update("INSERT INTO route_plan(plan_id, robot_id, zone_id, zone_version, payload, sha256) VALUES (?, ?, ?, ?, ?, ?)",
                    id, robotId, zone.zoneId(), zone.version(), payload, hash);
            return new Generated(id, hash, preview);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
        }
    }

    public Envelope get(String robotId, UUID planId) {
        var zone = zones.getWorkZone(robotId);
        var records = jdbc.query("SELECT zone_id, zone_version, payload, sha256 FROM route_plan WHERE plan_id = ? AND robot_id = ?",
                (rs, row) -> {
                    requireVersion(zone, rs.getLong("zone_id"), rs.getInt("zone_version"));
                    String payload = rs.getString("payload"), hash = rs.getString("sha256");
                    if (!hash(payload).equals(hash)) throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
                    return new Envelope(planId, hash, payload);
                }, planId, robotId);
        if (records.isEmpty()) throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        return records.getFirst();
    }

    public Preparation reportPreparation(String robotId, UUID planId, String sha256, String reportedBy) {
        var plan = get(robotId, planId);
        if (!plan.sha256().equals(sha256)) throw new BusinessException(ErrorCode.CPP_INPUT_INVALID);
        try {
            if (json.readTree(plan.payload()).path("preview").path("path").size() < 2) {
                throw new BusinessException(ErrorCode.CPP_INPUT_INVALID);
            }
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
        }
        // 재전송에도 최초 수신 시각과 보고 계정을 유지한다.
        jdbc.update("INSERT INTO route_plan_preparation(plan_id, sha256, reported_by) VALUES (?, ?, ?) ON CONFLICT (plan_id) DO NOTHING",
                planId, sha256, reportedBy);
        return preparation(robotId, planId);
    }

    public Preparation preparation(String robotId, UUID planId) {
        var plan = get(robotId, planId);
        var reports = jdbc.query("SELECT received_at FROM route_plan_preparation WHERE plan_id = ? AND sha256 = ?",
                (rs, row) -> rs.getTimestamp("received_at").toInstant(), planId, plan.sha256());
        return new Preparation(planId, plan.sha256(), !reports.isEmpty(), reports.isEmpty() ? null : reports.getFirst());
    }

    private void requireVersion(WorkZoneResponse zone, Long zoneId, int version) {
        if (!zone.zoneId().equals(zoneId) || zone.version() != version) {
            throw new BusinessException(ErrorCode.WORK_ZONE_CONFLICT);
        }
    }

    private String hash(String payload) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
