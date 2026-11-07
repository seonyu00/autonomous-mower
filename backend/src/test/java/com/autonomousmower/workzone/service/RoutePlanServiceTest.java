package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.workzone.dto.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RoutePlanServiceTest {
    @Test
    @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named = "ROUTE_PLAN_TEST_DB_URL", matches = ".+")
    void realPostgresPreservesPayloadAcrossServiceRestartAndRejectsOtherRobot() throws Exception {
        var source = new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("ROUTE_PLAN_TEST_DB_URL"),
                System.getenv("ROUTE_PLAN_TEST_DB_USER"), System.getenv("ROUTE_PLAN_TEST_DB_PASSWORD"));
        var database = new JdbcTemplate(source);
        database.execute(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/resources/db/migration/V15__store_route_plan.sql")));
        database.execute(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/resources/db/migration/V16__store_route_plan_preparation.sql")));
        when(previews.preview(eq("R1"), any())).thenReturn(preview);
        when(zones.getWorkZone(anyString())).thenReturn(zone);
        var writer = new RoutePlanService(previews, zones, database, json);
        var generated = writer.generate("R1", new CppPreviewRequest(2, 0.2));
        var reader = new RoutePlanService(previews, zones, database, json);
        var stored = reader.get("R1", generated.planId());
        assertThat(stored.sha256()).isEqualTo(generated.sha256());
        assertThat(json.readTree(stored.payload()).path("preview")).isEqualTo(json.readTree(json.writeValueAsString(preview)));
        assertThat(reader.preparation("R1", generated.planId()).reported()).isFalse();
        assertThatThrownBy(() -> reader.reportPreparation("R1", generated.planId(), "wrong", "operator"))
                .isInstanceOf(BusinessException.class);
        var first = reader.reportPreparation("R1", generated.planId(), generated.sha256(), "operator");
        var duplicate = reader.reportPreparation("R1", generated.planId(), generated.sha256(), "other-operator");
        assertThat(first.reported()).isTrue();
        assertThat(duplicate.receivedAt()).isEqualTo(first.receivedAt());
        assertThat(database.queryForObject("SELECT count(*) FROM route_plan_preparation", Integer.class)).isEqualTo(1);
        assertThat(database.queryForObject("SELECT reported_by FROM route_plan_preparation", String.class)).isEqualTo("operator");
        assertThatThrownBy(() -> reader.get("other", generated.planId())).isInstanceOf(BusinessException.class);
        when(zones.getWorkZone("R1")).thenReturn(new WorkZoneResponse(1L, "R1", 3, null, zone.zone()));
        assertThatThrownBy(() -> reader.get("R1", generated.planId())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> reader.reportPreparation("R1", generated.planId(), generated.sha256(), "operator"))
                .isInstanceOf(BusinessException.class);
    }
    final CppPreviewService previews = mock(CppPreviewService.class);
    final WorkZoneService zones = mock(WorkZoneService.class);
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final ObjectMapper json = new ObjectMapper();
    final RoutePlanService service = new RoutePlanService(previews, zones, jdbc, json);
    final WorkZoneResponse zone = new WorkZoneResponse(1L, "R1", 2, null,
            new WorkZonePayload("Polygon", 4326, new GeoJsonGeometryDto("Polygon", List.of(List.of(
                    List.of(127.0, 37.0), List.of(127.001, 37.0), List.of(127.001, 37.001), List.of(127.0, 37.0))))));
    final CppPreviewResponse preview = new CppPreviewResponse("R1", 1L, 2, 0.2, 100, 100,
            new CppPreviewResponse.Point(37, 127), List.of(new CppPreviewResponse.Point(37.0001, 127.0002),
            new CppPreviewResponse.Point(37.0002, 127.0003)));

    @Test void storesExactPreviewAndHashWithoutRecalculation() throws Exception {
        when(previews.preview(eq("R1"), any())).thenReturn(preview);
        when(zones.getWorkZone("R1")).thenReturn(zone);
        var result = service.generate("R1", new CppPreviewRequest(2, 0.2));
        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(anyString(), eq(result.planId()), eq("R1"), eq(1L), eq(2), payload.capture(), eq(result.sha256()));
        var parsed = json.readTree(payload.getValue());
        assertThat(parsed.path("preview")).isEqualTo(json.readTree(json.writeValueAsString(preview)));
        assertThat(parsed.path("workZone")).isEqualTo(json.readTree(json.writeValueAsString(zone)));
        assertThat(result.sha256()).isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(payload.getValue().getBytes(StandardCharsets.UTF_8))));
        verify(previews, times(1)).preview(eq("R1"), any());
    }

    @Test void changedZoneNeverStoresPreviewUnderAnotherVersion() {
        when(previews.preview(eq("R1"), any())).thenReturn(preview);
        when(zones.getWorkZone("R1")).thenReturn(new WorkZoneResponse(1L, "R1", 3, null, zone.zone()));
        assertThatThrownBy(() -> service.generate("R1", new CppPreviewRequest(2, 0.2))).isInstanceOf(BusinessException.class);
        verifyNoInteractions(jdbc);
    }

    @Test @SuppressWarnings("unchecked") void retrievalRejectsStaleZoneAndAlteredPayload() throws Exception {
        var id = java.util.UUID.randomUUID();
        when(zones.getWorkZone("R1")).thenReturn(zone);
        var row = mock(java.sql.ResultSet.class);
        when(row.getLong("zone_id")).thenReturn(1L);
        when(row.getInt("zone_version")).thenReturn(1);
        when(jdbc.query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), eq(id), eq("R1")))
                .thenAnswer(call -> List.of(((org.springframework.jdbc.core.RowMapper<?>) call.getArgument(1)).mapRow(row, 0)));
        assertThatThrownBy(() -> service.get("R1", id)).isInstanceOf(BusinessException.class);
        when(row.getInt("zone_version")).thenReturn(2);
        when(row.getString("payload")).thenReturn("altered");
        when(row.getString("sha256")).thenReturn("wrong hash");
        assertThatThrownBy(() -> service.get("R1", id)).isInstanceOf(BusinessException.class);
        String payload = "exact bytes";
        when(row.getString("payload")).thenReturn(payload);
        when(row.getString("sha256")).thenReturn(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8))));
        assertThat(service.get("R1", id).payload()).isEqualTo(payload);
        verifyNoInteractions(previews);
    }
}
