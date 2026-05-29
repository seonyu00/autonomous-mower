package com.autonomousmower.auth.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.autonomousmower.auth.dto.LoginRequest;
import com.autonomousmower.auth.dto.LoginResponse;
import com.autonomousmower.auth.dto.UserProfileResponse;
import com.autonomousmower.auth.security.JwtAuthenticationFilter;
import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.RestAccessDeniedHandler;
import com.autonomousmower.auth.security.RestAuthenticationEntryPoint;
import com.autonomousmower.auth.security.RoleName;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.auth.service.AuthService;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.config.SecurityConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuthController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AuthService authService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void loginReturnsTokenAndUserProfile() throws Exception {
        UserProfileResponse user = new UserProfileResponse(
                "admin",
                "admin",
                "admin",
                java.util.List.of("robots:read", "control:write", "control:takeover")
        );
        when(authService.login(any(LoginRequest.class))).thenReturn(new LoginResponse(
                "jwt-access-token",
                "Bearer",
                Instant.parse("2026-05-30T09:00:00Z"),
                user
        ));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("admin", "plain-password"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.accessToken", is("jwt-access-token")))
                .andExpect(jsonPath("$.data.tokenType", is("Bearer")))
                .andExpect(jsonPath("$.data.user.id", is("admin")))
                .andExpect(jsonPath("$.data.user.permissions", hasItem("control:write")));
    }

    @Test
    void loginFailureReturns401ErrorEnvelope() throws Exception {
        when(authService.login(any(LoginRequest.class))).thenThrow(new BusinessException(ErrorCode.INVALID_CREDENTIALS));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("admin", "wrong-password"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.error.code", is("INVALID_CREDENTIALS")));
    }

    @Test
    void meReturnsCurrentUserWhenBearerTokenIsValid() throws Exception {
        SecurityUser user = SecurityUser.from("operator", "operator", RoleName.OPERATOR);
        when(jwtTokenProvider.parse("valid-token")).thenReturn(user);

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id", is("operator")))
                .andExpect(jsonPath("$.data.role", is("operator")))
                .andExpect(jsonPath("$.data.permissions", hasItem("control:write")));
    }

    @Test
    void protectedMeWithoutTokenReturns401ErrorEnvelope() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.error.code", is("UNAUTHENTICATED")))
                .andExpect(jsonPath("$.error.details.path", containsString("/api/auth/me")));
    }
}
