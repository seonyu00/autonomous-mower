package com.autonomousmower.account.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "account_audit")
public class AccountAudit {
    @Id private String id;
    @Column(name = "actor_id", nullable = false, length = 50) private String actorId;
    @Column(name = "target_id", nullable = false, length = 50) private String targetId;
    @Column(nullable = false, length = 30) private String action;
    @Column(name = "previous_role", length = 20) private String previousRole;
    @Column(name = "new_role", length = 20) private String newRole;
    @Column(name = "previous_enabled") private Boolean previousEnabled;
    @Column(name = "new_enabled") private Boolean newEnabled;
    @Column(name = "occurred_at", nullable = false) private LocalDateTime occurredAt;

    protected AccountAudit() {}
    public AccountAudit(String actorId, String targetId, String action, String previousRole, String newRole,
                        Boolean previousEnabled, Boolean newEnabled, LocalDateTime occurredAt) {
        this.id = UUID.randomUUID().toString();
        this.actorId = actorId; this.targetId = targetId; this.action = action;
        this.previousRole = previousRole; this.newRole = newRole;
        this.previousEnabled = previousEnabled; this.newEnabled = newEnabled; this.occurredAt = occurredAt;
    }
    public String getId() { return id; }
    public String getActorId() { return actorId; }
    public String getTargetId() { return targetId; }
    public String getAction() { return action; }
    public String getPreviousRole() { return previousRole; }
    public String getNewRole() { return newRole; }
    public Boolean getPreviousEnabled() { return previousEnabled; }
    public Boolean getNewEnabled() { return newEnabled; }
    public LocalDateTime getOccurredAt() { return occurredAt; }
}
