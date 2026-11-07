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
            String payload = json.writeValueAsString(new Payload(1, "hd7000w-v1", zone, preview));
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
