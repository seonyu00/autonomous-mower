package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.workzone.dto.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CppPreviewServiceTest {
    final WorkZoneService zones = mock(WorkZoneService.class);
    final CppProcessRunner runner = mock(CppProcessRunner.class);
    final ObjectMapper json = new ObjectMapper();
    final CppPreviewService service = new CppPreviewService(zones, new GeoJsonPolygonMapper(), runner, json);
    final List<List<Double>> ring = List.of(List.of(127.0, 37.0), List.of(127.0002, 37.0),
            List.of(127.0002, 37.0002), List.of(127.0, 37.0002), List.of(127.0, 37.0));

    WorkZoneResponse zone(int version, List<List<List<Double>>> rings) {
        return new WorkZoneResponse(1L, "R1", version, null,
                new WorkZonePayload("Polygon", 4326, new GeoJsonGeometryDto("Polygon", rings)));
    }

    @BeforeEach void setup() {
        when(zones.getWorkZone("R1")).thenReturn(zone(2, List.of(ring)));
        when(runner.run(any())).thenReturn(output("[{\"lat\":37.00003,\"lon\":127.00004}]"));
    }

    byte[] output(String path) {
        return ("{\"rows\":22,\"columns\":17,\"origin\":{\"lat\":37,\"lon\":127},\"path\":" + path + "}")
                .getBytes(StandardCharsets.UTF_8);
    }

    @Test void convertsLongitudeLatitudeAndPreservesOutputPrecision() throws Exception {
        var result = service.preview("R1", new CppPreviewRequest(2, 1.0));
        var input = org.mockito.ArgumentCaptor.forClass(byte[].class);
        verify(runner).run(input.capture());
        var parsed = json.readTree(input.getValue());
        assertThat(parsed.path("polygon").size()).isEqualTo(4);
        assertThat(parsed.path("polygon").get(0).path("lat").asDouble()).isEqualTo(37);
        assertThat(parsed.path("polygon").get(0).path("lon").asDouble()).isEqualTo(127);
        assertThat(result.path().getFirst().lon()).isEqualTo(127.00004);
        assertThat(result.version()).isEqualTo(2);
    }

    @Test void rejectsStaleVersionBeforeExecution() {
        assertCode(ErrorCode.WORK_ZONE_CONFLICT, () -> service.preview("R1", new CppPreviewRequest(1, 1.0)));
        verifyNoInteractions(runner);
    }

    @Test void rejectsChangeWhileRunning() {
        when(zones.getWorkZone("R1")).thenReturn(zone(2, List.of(ring)), zone(3, List.of(ring)));
        assertCode(ErrorCode.WORK_ZONE_CONFLICT, () -> service.preview("R1", new CppPreviewRequest(2, 1.0)));
    }

    @Test void rejectsHolesExcessiveVerticesNonFiniteAndLargeBounds() {
        for (var rings : List.of(List.of(ring, ring), List.of(java.util.Collections.nCopies(502, ring.getFirst())),
                List.of(List.of(List.of(Double.NaN, 37.0), ring.get(1), ring.get(2), ring.get(0))),
                List.of(List.of(List.of(127.0, 37.0), List.of(128.0, 37.0), List.of(128.0, 38.0), List.of(127.0, 37.0))))) {
            when(zones.getWorkZone("R1")).thenReturn(zone(2, rings));
            assertCode(ErrorCode.CPP_INPUT_INVALID, () -> service.preview("R1", new CppPreviewRequest(2, 1.0)));
        }
        verifyNoInteractions(runner);
    }

    @Test void rejectsInvalidCellSizes() {
        for (double size : new double[]{0, -1, Double.NaN, Double.POSITIVE_INFINITY, 6}) {
            assertCode(ErrorCode.CPP_INPUT_INVALID, () -> service.preview("R1", new CppPreviewRequest(2, size)));
        }
        verifyNoInteractions(runner);
    }

    @Test void rejectsGridLargerThanEitherDimensionBeforeRunningCpp() {
        // 약 1m 구역뿐 아니라, 위도 보정 전에는 충분해 보이는 동서 폭도 거부한다.
        for (double[] bounds : List.of(new double[]{37, .00001, .00001},
                new double[]{37, .0001, .00001}, new double[]{60, .00006, .0001})) {
            double lat = bounds[0], width = bounds[1], height = bounds[2];
            var small = List.of(List.of(127.0, lat), List.of(127.0 + width, lat),
                    List.of(127.0 + width, lat + height), List.of(127.0, lat + height), List.of(127.0, lat));
            when(zones.getWorkZone("R1")).thenReturn(zone(2, List.of(small)));
            assertCode(ErrorCode.CPP_GRID_TOO_LARGE, () -> service.preview("R1", new CppPreviewRequest(2, 5.0)));
        }
        verifyNoInteractions(runner);
    }

    @Test void acceptsSmallGridAndKeepsEmptyPathAsSuccessfulResult() {
        var small = List.of(List.of(127.0, 37.0), List.of(127.00001, 37.0),
                List.of(127.00001, 37.00001), List.of(127.0, 37.00001), List.of(127.0, 37.0));
        when(zones.getWorkZone("R1")).thenReturn(zone(2, List.of(small)));
        when(runner.run(any())).thenReturn(output("[]"));
        assertThat(service.preview("R1", new CppPreviewRequest(2, 0.2)).path()).isEmpty();
        verify(runner).run(any());
    }

    @Test void acceptsEmptyResultAndRejectsMalformedOutput() {
        when(runner.run(any())).thenReturn(output("[]"));
        assertThat(service.preview("R1", new CppPreviewRequest(2, 1.0)).path()).isEmpty();
        for (String invalid : List.of("{}", "not json", "null", new String(output("[{\"lat\":91,\"lon\":127}]"), StandardCharsets.UTF_8))) {
            when(runner.run(any())).thenReturn(invalid.getBytes(StandardCharsets.UTF_8));
            assertCode(ErrorCode.CPP_OUTPUT_INVALID, () -> service.preview("R1", new CppPreviewRequest(2, 1.0)));
        }
    }

    static void assertCode(ErrorCode code, org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(code));
    }
}
