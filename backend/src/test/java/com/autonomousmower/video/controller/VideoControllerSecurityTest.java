package com.autonomousmower.video.controller;

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
import com.autonomousmower.video.dto.VideoSessionRequest;
import com.autonomousmower.video.dto.VideoSessionResponse;
import com.autonomousmower.video.dto.VideoStopResponse;
import com.autonomousmower.video.service.VideoSessionService;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(VideoController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class VideoControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private VideoSessionService videoSessionService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @WithMockUser(authorities = "telemetry:read")
    void offerReturnsAuthenticatedWhepSession() throws Exception {
        when(videoSessionService.start(eq("MOWER-01"), any(VideoSessionRequest.class)))
                .thenReturn(new VideoSessionResponse(
                        "video-session-001",
                        "MOWER-01",
                        "http://100.92.7.56:8889/mowers/MOWER-01/whep",
                        "connecting",
                        Instant.parse("2026-06-13T08:00:00Z")
                ));

        mockMvc.perform(post("/api/video/MOWER-01/offer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "robotId": "MOWER-01",
                                  "width": 640,
                                  "height": 480,
                                  "fps": 15,
                                  "maxBitrateKbps": 500
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId", is("video-session-001")))
                .andExpect(jsonPath("$.data.whepUrl", is(
                        "http://100.92.7.56:8889/mowers/MOWER-01/whep"
                )));
    }

    @Test
    @WithMockUser(authorities = "robots:read")
    void offerRejectsMissingTelemetryReadPermission() throws Exception {
        mockMvc.perform(post("/api/video/MOWER-01/offer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "robotId": "MOWER-01",
                                  "width": 640,
                                  "height": 480,
                                  "fps": 15,
                                  "maxBitrateKbps": 500
                                }
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("PERMISSION_DENIED")));
    }

    @Test
    @WithMockUser(authorities = "telemetry:read")
    void stopClosesTheBackendVideoSession() throws Exception {
        when(videoSessionService.stop(eq("MOWER-01"), any()))
                .thenReturn(new VideoStopResponse(
                        true,
                        "MOWER-01",
                        "video-session-001",
                        Instant.parse("2026-06-13T08:01:00Z")
                ));

        mockMvc.perform(post("/api/video/MOWER-01/stop")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "robotId": "MOWER-01",
                                  "sessionId": "video-session-001"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stopped", is(true)));
    }
}
