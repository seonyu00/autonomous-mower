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
    @Test void savedZoneSnapshotTraversesJavaAndRealCpp() {
        var zones = mock(WorkZoneService.class);
        var ring = List.of(List.of(127.0, 37.0), List.of(127.0002, 37.0), List.of(127.0002, 37.0002),
                List.of(127.0, 37.0002), List.of(127.0, 37.0));
        when(zones.getWorkZone("R1")).thenReturn(new WorkZoneResponse(1L, "R1", 2, null,
                new WorkZonePayload("Polygon", 4326, new GeoJsonGeometryDto("Polygon", List.of(ring)))));
        var service = new CppPreviewService(zones, new GeoJsonPolygonMapper(),
                new CppProcessRunner(System.getenv("CPP_EXECUTABLE"), 5000, 2097152), new ObjectMapper());
        var result = service.preview("R1", new CppPreviewRequest(2, 1.0));
        assertThat(result.path()).isNotEmpty();
        assertThat(result.rows()).isEqualTo(22);
        assertThat(result.columns()).isEqualTo(17);
        result.path().forEach(point -> {
            assertThat(point.lat()).isBetween(37.0, 37.0002);
            assertThat(point.lon()).isBetween(127.0, 127.0002);
        });
    }
}
