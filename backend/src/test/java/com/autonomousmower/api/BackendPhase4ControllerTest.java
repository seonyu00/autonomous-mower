package com.autonomousmower.api;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.autonomousmower.auth.security.JwtAuthenticationFilter;
import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.RestAccessDeniedHandler;
import com.autonomousmower.auth.security.RestAuthenticationEntryPoint;
import com.autonomousmower.config.SecurityConfig;
import com.autonomousmower.history.controller.HistoryController;
import com.autonomousmower.history.service.HistoryService;
import com.autonomousmower.logs.controller.LogController;
import com.autonomousmower.logs.service.LogService;
import com.autonomousmower.robot.controller.RobotController;
import com.autonomousmower.robot.dto.RobotResponse;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.workzone.controller.WorkZoneController;
import com.autonomousmower.workzone.dto.SaveWorkZoneResponse;
import com.autonomousmower.workzone.dto.WorkZoneRequest;
import com.autonomousmower.workzone.service.WorkZoneService;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {
        RobotController.class,
        WorkZoneController.class,
        HistoryController.class,
        LogController.class
})
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class BackendPhase4ControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RobotService robotService;

    @MockBean
    private WorkZoneService workZoneService;

    @MockBean
    private HistoryService historyService;

    @MockBean
    private LogService logService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @WithMockUser(authorities = "robots:read")
    void robotsListRequiresReadPermissionAndReturnsContractShape() throws Exception {
        when(robotService.findAll()).thenReturn(List.of(new RobotResponse(
                "MOWER-01", "Orin NX Model-A", "offline", true, null, null
        )));

        mockMvc.perform(get("/api/robots"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id", is("MOWER-01")))
                .andExpect(jsonPath("$.data[0].connectionState", is("offline")));
    }

    @Test
    @WithMockUser(authorities = "robots:read")
    void workZonePutRequiresControlPermission() throws Exception {
        mockMvc.perform(put("/api/robots/MOWER-01/work-zone")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validWorkZoneRequest()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("PERMISSION_DENIED")));
    }

    @Test
    @WithMockUser(authorities = "control:write")
    void workZonePutAcceptsControlPermission() throws Exception {
        when(workZoneService.saveWorkZone(eq("MOWER-01"), any(WorkZoneRequest.class)))
                .thenReturn(new SaveWorkZoneResponse(true, "MOWER-01", 12L, 5, LocalDateTime.parse("2026-05-30T01:01:00")));

        mockMvc.perform(put("/api/robots/MOWER-01/work-zone")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validWorkZoneRequest()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved", is(true)))
                .andExpect(jsonPath("$.data.version", is(5)));
    }

    @Test
    @WithMockUser(authorities = "history:read")
    void historyEndpointUsesHistoryReadPermission() throws Exception {
        when(historyService.findHistory(eq("MOWER-01"), any(), any())).thenReturn(List.of());

        mockMvc.perform(get("/api/history")
                        .param("robotId", "MOWER-01")
                        .param("from", "2026-05-30T00:00:00Z")
                        .param("to", "2026-05-30T01:00:00Z"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    @WithMockUser(authorities = "logs:read")
    void logsEndpointUsesLogsReadPermission() throws Exception {
        when(logService.findLogs(eq("MOWER-01"), any(), any(), eq("critical"))).thenReturn(List.of());

        mockMvc.perform(get("/api/logs")
                        .param("robotId", "MOWER-01")
                        .param("severity", "critical"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    private String validWorkZoneRequest() {
        return """
                {
                  "robotId": "MOWER-01",
                  "expectedVersion": 4,
                  "zone": {
                    "type": "Polygon",
                    "srid": 4326,
                    "geometry": {
                      "type": "Polygon",
                      "coordinates": [[
                        [127.0001, 37.5001],
                        [127.0005, 37.5001],
                        [127.0005, 37.5005],
                        [127.0001, 37.5005],
                        [127.0001, 37.5001]
                      ]]
                    }
                  }
                }
                """;
    }
}
