package com.autonomousmower.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.autonomousmower.auth.dto.LoginRequest;
import com.autonomousmower.auth.dto.LoginResponse;
import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class AuthServiceTest {

    private final AdminRepository adminRepository = mock(AdminRepository.class);
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final JwtTokenProvider jwtTokenProvider = mock(JwtTokenProvider.class);
    private final AuthService authService = new AuthService(adminRepository, passwordEncoder, jwtTokenProvider);

    @Test
    void loginSucceedsWithRepositoryAdminAndBcryptPassword() {
        String passwordHash = passwordEncoder.encode("plain-password");
        Admin admin = new Admin("admin", passwordHash, "admin", LocalDateTime.now());
        when(adminRepository.findById("admin")).thenReturn(Optional.of(admin));
        when(jwtTokenProvider.createToken(org.mockito.ArgumentMatchers.any(SecurityUser.class)))
                .thenReturn(new JwtTokenProvider.TokenResult("jwt-access-token", Instant.parse("2026-05-30T09:00:00Z")));

        LoginResponse response = authService.login(new LoginRequest("admin", "plain-password"));

        assertThat(response.accessToken()).isEqualTo("jwt-access-token");
        assertThat(response.tokenType()).isEqualTo("Bearer");
        assertThat(response.user().id()).isEqualTo("admin");
        assertThat(response.user().role()).isEqualTo("admin");
        assertThat(response.user().permissions()).contains("control:write", "control:takeover");
    }

    @Test
    void loginFailsWithWrongPassword() {
        String passwordHash = passwordEncoder.encode("plain-password");
        Admin admin = new Admin("admin", passwordHash, "admin", LocalDateTime.now());
        when(adminRepository.findById("admin")).thenReturn(Optional.of(admin));

        assertThatThrownBy(() -> authService.login(new LoginRequest("admin", "wrong-password")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_CREDENTIALS);
    }

    @Test
    void loginFailsWhenAdminDoesNotExist() {
        when(adminRepository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("missing", "plain-password")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_CREDENTIALS);
    }
}
