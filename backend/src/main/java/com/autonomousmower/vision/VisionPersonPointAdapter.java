package com.autonomousmower.vision;

import com.autonomousmower.workzone.dto.GeoJsonGeometryDto;
import com.autonomousmower.workzone.dto.WorkZonePayload;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** 이미 검증된 지도 좌표 후보를 표시용 영역으로 바꾸는 내부 어댑터. 외부 수신기는 없다. */
public final class VisionPersonPointAdapter {
    private static final double EARTH_RADIUS_METERS = 6_371_008.8;
    private static final int SEGMENTS = 32;
    public record Point(String observationId, int zoneVersion, Instant capturedAt, String source,
                        double longitude, double latitude, boolean depthValid,
                        boolean gpsValid, boolean headingValid) {}

    // 유효성 플래그는 호출자의 판단이다. 센서 시각 정합이나 보정 정확도를 검증하지 않는다.
    public VisionMapService.Input adapt(Point point) {
        if (point == null || point.observationId() == null || point.observationId().isBlank()
                || point.zoneVersion() < 0 || point.capturedAt() == null
                || point.source() == null || point.source().isBlank()
                || !point.depthValid() || !point.gpsValid() || !point.headingValid()
                || !Double.isFinite(point.longitude()) || !Double.isFinite(point.latitude())
                || point.longitude() < -180 || point.longitude() > 180
                || Math.abs(point.latitude()) > 85) {
            throw new IllegalArgumentException("유효한 측정과 WGS84 지도 좌표가 필요합니다.");
        }
        // 1m는 웹 검토용 표현이며 장비의 안전거리나 물체 크기가 아니다.
        double phi = Math.toRadians(point.latitude());
        double lambda = Math.toRadians(point.longitude());
        double angularRadius = 1.0 / EARTH_RADIUS_METERS;
        List<List<Double>> ring = new ArrayList<>();
        for (int i = 0; i < SEGMENTS; i++) {
            double bearing = 2 * Math.PI * i / SEGMENTS;
            double lat = Math.asin(Math.sin(phi) * Math.cos(angularRadius)
                    + Math.cos(phi) * Math.sin(angularRadius) * Math.cos(bearing));
            double lon = lambda + Math.atan2(Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(phi),
                    Math.cos(angularRadius) - Math.sin(phi) * Math.sin(lat));
            double longitude = Math.toDegrees(lon);
            if (longitude < -180 || longitude > 180) {
                throw new IllegalArgumentException("날짜 변경선에 걸친 표시 영역은 지원하지 않습니다.");
            }
            ring.add(List.of(longitude, Math.toDegrees(lat)));
        }
        ring.add(ring.getFirst());
        return new VisionMapService.Input(point.observationId(), point.zoneVersion(), point.capturedAt(),
                VisionMapService.State.DANGEROUS, point.source(),
                new WorkZonePayload("Polygon", 4326, new GeoJsonGeometryDto("Polygon", List.of(ring))));
    }
}
