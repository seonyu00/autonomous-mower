package com.autonomousmower.workzone.dto;

import java.util.List;

public record CppPreviewResponse(
        String robotId, Long zoneId, int version, double cellSizeM,
        int rows, int columns, Point origin, List<Point> path, List<Point> transitPath
) {
    public CppPreviewResponse(String robotId, Long zoneId, int version, double cellSizeM, int rows, int columns, Point origin, List<Point> path) {
        this(robotId, zoneId, version, cellSizeM, rows, columns, origin, path, List.of());
    }
    public record Point(double lat, double lon) {}
}
