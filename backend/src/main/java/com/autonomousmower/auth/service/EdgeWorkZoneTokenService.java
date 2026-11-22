package com.autonomousmower.auth.service;

import com.autonomousmower.auth.entity.EdgeWorkZoneToken;
import com.autonomousmower.auth.repository.EdgeWorkZoneTokenRepository;
import com.autonomousmower.auth.security.EdgeWorkZonePrincipal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EdgeWorkZoneTokenService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final EdgeWorkZoneTokenRepository tokens;
    public EdgeWorkZoneTokenService(EdgeWorkZoneTokenRepository tokens) { this.tokens = tokens; }

    @Transactional
    public IssuedToken issue(String robotId, String label, String actor) {
        byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
        String secret = "mwr_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = Instant.now();
        EdgeWorkZoneToken token = new EdgeWorkZoneToken(UUID.randomUUID(), robotId, hash(secret), label, actor,
                now, now.plus(90, ChronoUnit.DAYS));
        tokens.save(token);
        return new IssuedToken(token.getTokenId(), secret, token.getExpiresAt());
    }

    @Transactional(readOnly = true)
    public EdgeWorkZonePrincipal authenticate(String secret) {
        if (secret == null || !secret.matches("mwr_[A-Za-z0-9_-]{43}")) return null;
        return tokens.findByTokenHash(hash(secret))
                .filter(token -> token.getRevokedAt() == null && token.getExpiresAt().isAfter(Instant.now()))
                .map(token -> new EdgeWorkZonePrincipal(token.getTokenId(), token.getRobotId())).orElse(null);
    }

    @Transactional
    public void revoke(String robotId, UUID tokenId) {
        EdgeWorkZoneToken token = tokens.findById(tokenId).filter(value -> value.getRobotId().equals(robotId))
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 Jetson 작업 구역 토큰입니다."));
        token.revoke(Instant.now());
    }

    private static String hash(String value) {
        try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
    public record IssuedToken(UUID tokenId, String token, Instant expiresAt) { }
}
