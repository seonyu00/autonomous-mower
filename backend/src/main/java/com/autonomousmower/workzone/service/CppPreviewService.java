package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.workzone.dto.*;
import com.autonomousmower.workzone.dto.CppPreviewResponse.Point;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class CppPreviewService {
    private static final int MAX_CELLS = 100000;
    private final WorkZoneService zones;
    private final GeoJsonPolygonMapper polygons;
    private final CppProcessRunner runner;
    private final ObjectMapper json;

    public CppPreviewService(WorkZoneService zones, GeoJsonPolygonMapper polygons,
                             CppProcessRunner runner, ObjectMapper json) {
        this.zones = zones;
        this.polygons = polygons;
        this.runner = runner;
        this.json = json;
    }

    public CppPreviewResponse preview(String robotId, CppPreviewRequest request) {
        if (request.expectedVersion() == null || request.cellSizeM() == null
                || !Double.isFinite(request.cellSizeM()) || request.cellSizeM() < 0.2 || request.cellSizeM() > 5) {
            throw new BusinessException(ErrorCode.CPP_INPUT_INVALID);
        }
        WorkZoneResponse zone = zones.getWorkZone(robotId);
        if (zone.version() != request.expectedVersion()) throw new BusinessException(ErrorCode.WORK_ZONE_CONFLICT);
        List<Point> polygon = validatePolygon(zone.zone(), request.cellSizeM());
        try {
            byte[] input = json.writeValueAsBytes(Map.of("polygon", polygon, "cell_size_m", request.cellSizeM()));
            JsonNode output = json.reader().with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree(runner.run(input));
            if (output == null || !output.path("rows").canConvertToInt() || !output.path("rows").isIntegralNumber()
                    || !output.path("columns").canConvertToInt() || !output.path("columns").isIntegralNumber()
                    || !output.path("path").isArray()) throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
            int rows = output.path("rows").intValue(), columns = output.path("columns").intValue();
            if (rows < 1 || columns < 1 || (long) rows * columns > MAX_CELLS
                    || output.path("path").size() > 20000) throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
            Point origin = readPoint(output.path("origin"));
            List<Point> path = new ArrayList<>();
            for (JsonNode point : output.path("path")) path.add(readPoint(point));
            // 실행 중 다른 사용자가 저장한 경우 최신 구역의 경로로 반환하지 않는다.
            WorkZoneResponse latest = zones.getWorkZone(robotId);
            if (!latest.zoneId().equals(zone.zoneId()) || latest.version() != zone.version()) {
                throw new BusinessException(ErrorCode.WORK_ZONE_CONFLICT);
            }
            return new CppPreviewResponse(robotId, zone.zoneId(), zone.version(), request.cellSizeM(),
                    rows, columns, origin, List.copyOf(path));
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
        }
    }

    private List<Point> validatePolygon(WorkZonePayload payload, double cellSize) {
        if (payload == null || payload.geometry() == null || payload.geometry().coordinates() == null
                || payload.geometry().coordinates().size() != 1) throw new BusinessException(ErrorCode.CPP_INPUT_INVALID);
        var ring = payload.geometry().coordinates().getFirst();
        if (ring == null || ring.size() < 4 || ring.size() > 501) throw new BusinessException(ErrorCode.CPP_INPUT_INVALID);
        List<Point> points = new ArrayList<>();
        for (var coordinate : ring) {
            if (coordinate == null || coordinate.size() != 2 || coordinate.get(0) == null || coordinate.get(1) == null
                    || !validPoint(coordinate.get(1), coordinate.get(0)) || Math.abs(coordinate.get(1)) > 85) {
                throw new BusinessException(ErrorCode.CPP_INPUT_INVALID);
            }
            points.add(new Point(coordinate.get(1), coordinate.get(0)));
        }
        var polygon = polygons.toPolygon(payload);
        var bounds = polygon.getEnvelopeInternal();
        // 격자 할당 전 보수적인 상한으로 메모리와 계산량을 제한한다. 경로 알고리즘은 C++만 사용한다.
        double rows = Math.ceil(Math.toRadians(bounds.getHeight()) * 6378137 / cellSize);
        double columns = Math.ceil(Math.toRadians(bounds.getWidth()) * 6378137 / cellSize);
        if (bounds.getWidth() > 1 || bounds.getHeight() > 1 || rows * columns > MAX_CELLS) {
            throw new BusinessException(ErrorCode.CPP_INPUT_INVALID);
        }
        // CPP의 fromGpsBounds와 같은 평균 위도 보정으로 최소 한 칸 생성 가능 여부를 확인한다.
        double heightM = Math.toRadians(bounds.getHeight()) * 6378137;
        double widthM = Math.toRadians(bounds.getWidth()) * 6378137
                * Math.cos(Math.toRadians((bounds.getMinY() + bounds.getMaxY()) / 2));
        if (heightM < cellSize || widthM < cellSize) {
            throw new BusinessException(ErrorCode.CPP_GRID_TOO_LARGE);
        }
        return points.subList(0, points.size() - 1);
    }

    private Point readPoint(JsonNode node) {
        if (!node.path("lat").isNumber() || !node.path("lon").isNumber()
                || !validPoint(node.path("lat").doubleValue(), node.path("lon").doubleValue())) {
            throw new BusinessException(ErrorCode.CPP_OUTPUT_INVALID);
        }
        return new Point(node.path("lat").doubleValue(), node.path("lon").doubleValue());
    }

    private boolean validPoint(double lat, double lon) {
        return Double.isFinite(lat) && Double.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    }
}
