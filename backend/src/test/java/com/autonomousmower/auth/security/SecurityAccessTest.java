package com.autonomousmower.auth.security;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.autonomousmower.config.SecurityConfig;
import com.autonomousmower.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(controllers = SecurityAccessTest.ProtectedController.class)
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
