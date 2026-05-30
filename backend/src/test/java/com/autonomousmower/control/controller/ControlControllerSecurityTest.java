package com.autonomousmower.control.controller;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.autonomousmower.auth.security.JwtAuthenticationFilter;
import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.RestAccessDeniedHandler;
import com.autonomousmower.auth.security.RestAuthenticationEntryPoint;
import com.autonomousmower.config.SecurityConfig;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.service.ControlCommandService;
import com.autonomousmower.control.service.ControlLockService;
import com.autonomousmower.control.service.EmergencyStopService;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ControlController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class ControlControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ControlLockService controlLockService;

    @MockBean
    private EmergencyStopService emergencyStopService;

    @MockBean
    private ControlCommandService controlCommandService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @WithMockUser(authorities = "robots:read")
    void claimRequiresControlWritePermission() throws Exception {
        mockMvc.perform(post("/api/control/MOWER-01/claim")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"idempotencyKey":"claim-key","requestedMode":"manual"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("PERMISSION_DENIED")));
    }

    @Test
    @WithMockUser(authorities = "control:write")
    void takeoverRequiresTakeoverPermission() throws Exception {
        mockMvc.perform(post("/api/control/MOWER-01/takeover")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"idempotencyKey":"takeover-key","reason":"supervisor takeover"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("PERMISSION_DENIED")));
    }

    @Test
    @WithMockUser(authorities = "control:write")
    void estopUsesControlWritePermission() throws Exception {
        when(emergencyStopService.activate(eq("MOWER-01"), any(), any())).thenReturn(response("emergency-stop"));

        mockMvc.perform(post("/api/control/MOWER-01/estop")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"idempotencyKey":"estop-key","reason":"operator emergency stop"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.commandType", is("emergency-stop")));
    }

    private ControlCommandResponse response(String commandType) {
        Instant now = Instant.parse("2026-05-30T01:00:00Z");
        return new ControlCommandResponse(
                true,
                "MOWER-01",
                "cmd-001",
                commandType,
                now,
                now,
                "held",
                "operator",
                "manual",
                false
        );
    }
}
