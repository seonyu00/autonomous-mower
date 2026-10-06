package com.autonomousmower.auth.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import com.autonomousmower.auth.repository.AdminRepository;
import org.springframework.security.authentication.BadCredentialsException;

@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final Duration expiration;
    private final AdminRepository admins;

    public JwtTokenProvider(
            @Value("${app.security.jwt.secret}") String secret,
            @Value("${app.security.jwt.expiration}") Duration expiration,
            AdminRepository admins
    ) {
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiration = expiration;
        this.admins = admins;
    }

    public TokenResult createToken(SecurityUser user) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(expiration);
        String token = Jwts.builder()
                .subject(user.getAdminId())
                .claim("name", user.getDisplayName())
                .claim("role", user.getRoleName())
                .claim("permissions", user.getPermissionValues())
                .claim("sessionVersion", user.getSessionVersion())
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .signWith(secretKey)
                .compact();
        return new TokenResult(token, expiresAt);
    }

    public SecurityUser parse(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        String adminId = claims.getSubject();
        Number version = claims.get("sessionVersion", Number.class);
        if (version == null) throw new BadCredentialsException("다시 로그인해야 합니다.");
        var admin = admins.findById(adminId).orElseThrow(() -> new BadCredentialsException("종료된 계정입니다."));
        if (!admin.isEnabled() || admin.getSessionVersion() != version.longValue()) {
            throw new BadCredentialsException("종료된 세션입니다.");
        }
        return SecurityUser.from(adminId, RoleName.fromValue(admin.getRole()), admin.getSessionVersion(), admin.isMustChangePassword());
    }

    public void requireCurrentPermission(SecurityUser user, Permission permission) {
        var admin = admins.findById(user.getAdminId()).orElseThrow(() -> new com.autonomousmower.common.exception.BusinessException(
                com.autonomousmower.common.exception.ErrorCode.INVALID_CREDENTIALS));
        if (!admin.isEnabled() || admin.getSessionVersion() != user.getSessionVersion()) {
            throw new com.autonomousmower.common.exception.BusinessException(com.autonomousmower.common.exception.ErrorCode.INVALID_CREDENTIALS);
        }
        if (admin.isMustChangePassword() || !RoleName.fromValue(admin.getRole()).getPermissions().contains(permission)) {
            throw new org.springframework.security.access.AccessDeniedException("현재 계정에는 제어권 취득 권한이 없습니다.");
        }
    }

    public record TokenResult(
            String token,
            Instant expiresAt
    ) {
    }
}
