package com.autonomousmower.workzone.service;

import com.autonomousmower.workzone.dto.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named = "CPP_EXECUTABLE", matches = ".+")
class CppNativeIntegrationTest {
    @Test void entryFromOutsideWorkZoneUsesTravelPolygonAndExactEndpoints() {
        var zones=mock(WorkZoneService.class);
        var work=List.of(point(10,10),point(25,10),point(25,25),point(10,25),point(10,10));
        var travel=List.of(point(0,0),point(30,0),point(30,30),point(0,30),point(0,0));
        var payload=new WorkZonePayload("Polygon",4326,new GeoJsonGeometryDto("Polygon",List.of(work)));
        var boundary=new WorkZonePayload("Polygon",4326,new GeoJsonGeometryDto("Polygon",List.of(travel)));
        when(zones.getWorkZone("R1")).thenReturn(new WorkZoneResponse(1L,"R1",2,null,payload,boundary));
        var service=new CppPreviewService(zones,new GeoJsonPolygonMapper(),new CppProcessRunner(System.getenv("CPP_EXECUTABLE"),5000,2097152),new ObjectMapper());
        var coordinate=point(3,3); var start=new CppPreviewResponse.Point(coordinate.get(1),coordinate.get(0));
        var result=service.preview("R1",new CppPreviewRequest(2,.5,start));
        assertThat(result.transitPath()).hasSizeGreaterThan(1);
        assertThat(result.transitPath().getFirst()).isEqualTo(start);
        assertThat(result.transitPath().getLast()).isEqualTo(result.path().getFirst());
        var outside=point(40,40);
        assertThatThrownBy(()->service.preview("R1",new CppPreviewRequest(2,.5,new CppPreviewResponse.Point(outside.get(1),outside.get(0))))).isInstanceOf(com.autonomousmower.common.exception.BusinessException.class);
    }
    List<Double> point(double east, double north) {
        return List.of(127 + east / (111319.49079327358 * Math.cos(Math.toRadians(37))),
                37 + north / 111319.49079327358);
    }

    @Test void concaveSlopedAndHoledZonesReturnContinuousContainedPaths() {
        var square = List.of(point(0, 0), point(40, 0), point(40, 40), point(0, 40), point(0, 0));
        var hole = List.of(point(12, 12), point(28, 12), point(28, 28), point(12, 28), point(12, 12));
        var uShape = List.of(point(0, 0), point(40, 0), point(40, 40), point(28, 40), point(28, 12),
                point(12, 12), point(12, 40), point(0, 40), point(0, 0));
        var triangle = List.of(point(0, 0), point(40, 0), point(20, 40), point(0, 0));
        for (var rings : List.of(List.of(uShape), List.of(square, hole), List.of(triangle))) {
            var zones = mock(WorkZoneService.class);
            var payload = new WorkZonePayload("Polygon", 4326, new GeoJsonGeometryDto("Polygon", rings));
            when(zones.getWorkZone("R1")).thenReturn(new WorkZoneResponse(1L, "R1", 2, null, payload));
            var service = new CppPreviewService(zones, new GeoJsonPolygonMapper(),
                    new CppProcessRunner(System.getenv("CPP_EXECUTABLE"), 5000, 2097152), new ObjectMapper());
            var result = service.preview("R1", new CppPreviewRequest(2, 0.5));
            assertThat(result.path()).hasSizeGreaterThan(2);
            var polygon = new GeoJsonPolygonMapper().toPolygon(payload);
            var route = polygon.getFactory().createLineString(result.path().stream()
                    .map(p -> new org.locationtech.jts.geom.Coordinate(p.lon(), p.lat()))
                    .toArray(org.locationtech.jts.geom.Coordinate[]::new));
            assertThat(polygon.contains(route)).isTrue();
            assertThat(polygon.getBoundary().intersects(route)).isFalse();
            // C++와 독립적인 JTS 거리 계산으로 차체 모서리까지 경계 안에 드는지 확인한다.
            var bounds = polygon.getEnvelopeInternal();
            double eastScale = 111319.49079327358 * Math.cos(Math.toRadians((bounds.getMinY() + bounds.getMaxY()) / 2));
            org.locationtech.jts.geom.CoordinateFilter toMeters = coordinate -> {
                coordinate.x = (coordinate.x - bounds.getMinX()) * eastScale;
                coordinate.y = (coordinate.y - bounds.getMinY()) * 111319.49079327358;
            };
            var metricPolygon = polygon.copy();
            var metricRoute = route.copy();
            metricPolygon.apply(toMeters);
            metricRoute.apply(toMeters);
            metricPolygon.geometryChanged();
            metricRoute.geometryChanged();
            assertThat(metricRoute.distance(metricPolygon.getBoundary())).isGreaterThanOrEqualTo(Math.hypot(1.150, 1.030) / 2 - 0.00001);
            // 빈 경로나 한쪽 영역만 반환해 검사를 피하지 않는지 확인한다.
            assertThat(result.path().stream().mapToDouble(CppPreviewResponse.Point::lon).max().orElseThrow()
                    - result.path().stream().mapToDouble(CppPreviewResponse.Point::lon).min().orElseThrow()).isGreaterThan(0.0001);
        }
    }

    @Test void savedZoneSnapshotTraversesJavaAndRealCpp() {
        var zones = mock(WorkZoneService.class);
        var ring = List.of(List.of(127.0, 37.0), List.of(127.0002, 37.0), List.of(127.0002, 37.0002),
                List.of(127.0, 37.0002), List.of(127.0, 37.0));
        when(zones.getWorkZone("R1")).thenReturn(new WorkZoneResponse(1L, "R1", 2, null,
                new WorkZonePayload("Polygon", 4326, new GeoJsonGeometryDto("Polygon", List.of(ring)))));
        var service = new CppPreviewService(zones, new GeoJsonPolygonMapper(),
                new CppProcessRunner(System.getenv("CPP_EXECUTABLE"), 5000, 2097152), new ObjectMapper());
        var result = service.preview("R1", new CppPreviewRequest(2, 0.5));
        assertThat(result.path()).isNotEmpty();
        assertThat(result.rows()).isEqualTo(44);
        assertThat(result.columns()).isEqualTo(35);
        result.path().forEach(point -> {
            assertThat(point.lat()).isBetween(37.0, 37.0002);
            assertThat(point.lon()).isBetween(127.0, 127.0002);
        });
    }
}
