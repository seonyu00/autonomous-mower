package com.autonomousmower.logs.controller;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.autonomousmower.auth.security.JwtAuthenticationFilter;
import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.RestAccessDeniedHandler;
import com.autonomousmower.auth.security.RestAuthenticationEntryPoint;
import com.autonomousmower.config.SecurityConfig;
import com.autonomousmower.logs.dto.SaveSnapshotResponse;
import com.autonomousmower.logs.model.SnapshotContent;
import com.autonomousmower.logs.service.SnapshotService;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(SnapshotController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class SnapshotControllerSecurityTest {

    private static final byte[] JPEG = new byte[]{
            (byte) 0xff, (byte) 0xd8, 1, 2, (byte) 0xff, (byte) 0xd9
    };

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SnapshotService snapshotService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @WithMockUser(authorities = "telemetry:read")
    void uploadsManualSnapshotWithTelemetryReadPermission() throws Exception {
        when(snapshotService.save(eq("MOWER-01"), eq("manual"), any(), any()))
                .thenReturn(new SaveSnapshotResponse(
                        "snapshot-001",
                        "MOWER-01",
                        "manual",
                        Instant.parse("2026-06-15T12:29:58Z"),
                        "image/jpeg",
                        JPEG.length,
                        "/api/logs/snapshots/snapshot-001"
                ));
        MockMultipartFile file = new MockMultipartFile("file", "snapshot.jpg", "image/jpeg", JPEG);

        mockMvc.perform(multipart("/api/robots/MOWER-01/snapshots")
                        .file(file)
                        .param("captureType", "manual")
                        .param("capturedAt", "2026-06-15T12:29:58Z"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.snapshotId", is("snapshot-001")))
                .andExpect(jsonPath("$.data.url", is("/api/logs/snapshots/snapshot-001")));
    }

    @Test
    @WithMockUser(authorities = "logs:read")
    void downloadsSnapshotWithLogsReadPermission() throws Exception {
        when(snapshotService.load("snapshot-001"))
                .thenReturn(new SnapshotContent(JPEG, "image/jpeg"));

        mockMvc.perform(get("/api/logs/snapshots/snapshot-001"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG))
                .andExpect(content().bytes(JPEG));
    }

    @Test
    @WithMockUser(authorities = "robots:read")
    void rejectsUploadWithoutTelemetryReadPermission() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "snapshot.jpg", "image/jpeg", JPEG);

        mockMvc.perform(multipart("/api/robots/MOWER-01/snapshots")
                        .file(file)
                        .param("captureType", "manual")
                        .param("capturedAt", "2026-06-15T12:29:58Z"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("PERMISSION_DENIED")));
    }
}
