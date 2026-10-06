package com.autonomousmower.auth.security;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.BadCredentialsException;

class JwtAccountSessionTest {
    private static final String TEST_KEY = "test-only-account-session-signing-key-20261005";
    private final AdminRepository admins = mock(AdminRepository.class);
    private final JwtTokenProvider tokens = new JwtTokenProvider(TEST_KEY, Duration.ofHours(1), admins);
    private final Admin admin = new Admin("viewer", "test-hash", "read-only", LocalDateTime.now());

    private String issue() {
        when(admins.findById("viewer")).thenReturn(Optional.of(admin));
        return tokens.createToken(SecurityUser.from("viewer", RoleName.READ_ONLY, admin.getSessionVersion(), false)).token();
    }

    @Test
    void currentDatabaseRoleOverridesSignedRoleClaim() {
        when(admins.findById("viewer")).thenReturn(Optional.of(admin));
        var token = tokens.createToken(SecurityUser.from("viewer", "viewer", RoleName.ADMIN)).token();
        assertThat(tokens.parse(token).getPermissionValues()).doesNotContain("accounts:write", "control:write");
    }

    @Test
    void roleChangeRejectsPreviousToken() {
        String token = issue();
        admin.changeAccess("operator", true, LocalDateTime.now());
        assertThatThrownBy(() -> tokens.parse(token)).isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void disabledOrRemovedAccountCannotUseToken() {
        String token = issue();
        admin.changeAccess("read-only", false, LocalDateTime.now());
        assertThatThrownBy(() -> tokens.parse(token)).isInstanceOf(BadCredentialsException.class);
        when(admins.findById("viewer")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> tokens.parse(token)).isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void passwordResetRejectsPreviousTokenAndRestrictsNewLogin() {
        String token = issue();
        admin.changePassword("new-test-hash", true, LocalDateTime.now());
        assertThatThrownBy(() -> tokens.parse(token)).isInstanceOf(BadCredentialsException.class);
        var replacement = tokens.createToken(SecurityUser.from("viewer", RoleName.READ_ONLY, admin.getSessionVersion(), true)).token();
        assertThat(tokens.parse(replacement).isMustChangePassword()).isTrue();
        assertThat(tokens.parse(replacement).getAuthorities()).isEmpty();
    }

    @Test
    void legacyTokenWithoutSessionVersionRequiresLogin() {
        String legacy = Jwts.builder().subject("viewer").claim("role", "admin")
                .signWith(Keys.hmacShaKeyFor(TEST_KEY.getBytes(StandardCharsets.UTF_8))).compact();
        assertThatThrownBy(() -> tokens.parse(legacy)).isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void controlAdmissionRechecksAnAlreadyAuthenticatedPrincipalAfterRevocation() {
        when(admins.findById("viewer")).thenReturn(Optional.of(admin));
        admin.changeAccess("operator", true, LocalDateTime.now());
        var admitted = SecurityUser.from("viewer", RoleName.OPERATOR, admin.getSessionVersion(), false);
        tokens.requireCurrentPermission(admitted, Permission.CONTROL_WRITE);
        admin.changeAccess("read-only", true, LocalDateTime.now());
        assertThatThrownBy(() -> tokens.requireCurrentPermission(admitted, Permission.CONTROL_WRITE))
                .isInstanceOf(com.autonomousmower.common.exception.BusinessException.class);
    }
}
