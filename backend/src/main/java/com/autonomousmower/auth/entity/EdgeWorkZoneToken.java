package com.autonomousmower.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "edge_work_zone_token")
public class EdgeWorkZoneToken {
    @Id private UUID tokenId;
    @Column(nullable = false) private String robotId;
    @Column(nullable = false, unique = true, length = 64) private String tokenHash;
    @Column(nullable = false) private String label;
    @Column(nullable = false) private String createdBy;
    @Column(nullable = false) private Instant createdAt;
    @Column(nullable = false) private Instant expiresAt;
    private Instant revokedAt;

    protected EdgeWorkZoneToken() { }

    public EdgeWorkZoneToken(UUID tokenId, String robotId, String tokenHash, String label, String createdBy,
                             Instant createdAt, Instant expiresAt) {
        this.tokenId = tokenId; this.robotId = robotId; this.tokenHash = tokenHash; this.label = label;
        this.createdBy = createdBy; this.createdAt = createdAt; this.expiresAt = expiresAt;
    }
    public UUID getTokenId() { return tokenId; }
    public String getRobotId() { return robotId; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public void revoke(Instant now) { revokedAt = now; }
}
