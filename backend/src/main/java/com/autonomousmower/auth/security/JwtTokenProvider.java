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

@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final Duration expiration;

    public JwtTokenProvider(
            @Value("${app.security.jwt.secret}") String secret,
            @Value("${app.security.jwt.expiration}") Duration expiration
    ) {
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiration = expiration;
    }

    public TokenResult createToken(SecurityUser user) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(expiration);
        String token = Jwts.builder()
                .subject(user.getAdminId())
                .claim("name", user.getDisplayName())
                .claim("role", user.getRoleName())
                .claim("permissions", user.getPermissionValues())
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
        String displayName = claims.get("name", String.class);
        String role = claims.get("role", String.class);
        RoleName roleName = RoleName.fromValue(role);
        return SecurityUser.from(adminId, displayName, roleName);
    }

    public record TokenResult(
            String token,
            Instant expiresAt
    ) {
    }
}
