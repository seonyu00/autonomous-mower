package com.autonomousmower.auth.security;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.autonomousmower.config.SecurityConfig;
import com.autonomousmower.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(controllers = SecurityAccessTest.ProtectedController.class, properties = {
        "app.security.allowed-origins=https://mower-demo.example,http://localhost:5173,http://127.0.0.1:5173"
})
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        SecurityAccessTest.ProtectedController.class
})
class SecurityAccessTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private AuthService authService;

    @ParameterizedTest
    @ValueSource(strings = {"GET", "POST", "PUT", "PATCH"})
    void allowedOriginPreflightDoesNotRequireAuthentication(String method) throws Exception {
        mockMvc.perform(options("/api/test/protected")
                        .header("Origin", "https://mower-demo.example")
                        .header("Access-Control-Request-Method", method)
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://mower-demo.example"))
                .andExpect(header().string("Access-Control-Allow-Headers", "authorization, content-type"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://mower-demo.example", "http://localhost:5173", "http://127.0.0.1:5173"})
    @WithMockUser(authorities = "control:write")
    void allowedOriginCanReadAuthenticatedResponse(String origin) throws Exception {
        mockMvc.perform(get("/api/test/control-write").header("Origin", origin))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", origin))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://other.example", "https://mower-demo.example.evil.example",
            "http://mower-demo.example", "https://mower-demo.example:8443", "null"})
    @WithMockUser(authorities = "control:write")
    void unlistedOriginCannotReadAuthenticatedResponse(String origin) throws Exception {
        mockMvc.perform(get("/api/test/control-write").header("Origin", origin))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void unlistedOriginPreflightIsRejected() throws Exception {
        mockMvc.perform(options("/api/test/protected")
                        .header("Origin", "https://other.example")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void unlistedMethodPreflightIsRejected() throws Exception {
        mockMvc.perform(options("/api/test/protected")
                        .header("Origin", "https://mower-demo.example")
                        .header("Access-Control-Request-Method", "DELETE"))
                .andExpect(status().isForbidden());
    }

    @Test
    void unlistedHeaderPreflightIsRejected() throws Exception {
        mockMvc.perform(options("/api/test/protected")
                        .header("Origin", "https://mower-demo.example")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "x-admin-role"))
                .andExpect(status().isForbidden());
    }

    @Test
    void allowedOriginStillRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/test/protected").header("Origin", "https://mower-demo.example"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://mower-demo.example"));
    }

    @Test
    @WithMockUser(authorities = "robots:read")
    void allowedOriginDoesNotGrantControlPermission() throws Exception {
        mockMvc.perform(get("/api/test/control-write").header("Origin", "https://mower-demo.example"))
                .andExpect(status().isForbidden())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://mower-demo.example"));
    }

    @Test
    void protectedApiWithoutAuthenticationReturns401() throws Exception {
        mockMvc.perform(get("/api/test/protected"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")));
    }

    @Test
    @WithMockUser(authorities = "robots:read")
    void protectedApiWithInsufficientPermissionReturns403() throws Exception {
        mockMvc.perform(get("/api/test/control-write"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("PERMISSION_DENIED")));
    }

    @Test
    @WithMockUser(authorities = "control:write")
    void protectedApiWithRequiredPermissionSucceeds() throws Exception {
        mockMvc.perform(get("/api/test/control-write"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data", is("ok")));
    }

    @Test
    void temporaryPasswordSessionCannotUseOrdinaryApi() throws Exception {
        var user = SecurityUser.from("temporary", RoleName.ADMIN, 1, true);
        org.mockito.Mockito.when(jwtTokenProvider.parse("temporary-token")).thenReturn(user);
        mockMvc.perform(get("/api/test/protected").header("Authorization", "Bearer temporary-token"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "settings:read")
    void settingsReadDoesNotGrantAccountManagement() throws Exception {
        mockMvc.perform(get("/api/accounts")).andExpect(status().isForbidden());
    }

    @RestController
    static class ProtectedController {

        @GetMapping("/api/test/protected")
        String protectedApi() {
            return "ok";
        }

        @GetMapping("/api/test/control-write")
        @PreAuthorize("hasAuthority('control:write')")
        com.autonomousmower.common.api.ApiResponse<String> controlWriteApi() {
            return com.autonomousmower.common.api.ApiResponse.success("ok");
        }
    }
}
