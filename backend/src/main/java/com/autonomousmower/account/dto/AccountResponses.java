package com.autonomousmower.account.dto;

import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.security.RoleName;
import java.time.Instant;
import java.time.ZoneOffset;
import com.autonomousmower.account.entity.AccountAudit;
import java.util.List;

public final class AccountResponses {
    private AccountResponses() {}
    public record Account(String adminId, String role, boolean enabled, long version,
                          boolean mustChangePassword, Instant createdAt, Instant updatedAt) {
        public static Account from(Admin admin) {
            return new Account(admin.getAdminId(), RoleName.fromValue(admin.getRole()).getValue(), admin.isEnabled(),
                    admin.getVersion(), admin.isMustChangePassword(), admin.getCreatedAt().toInstant(ZoneOffset.UTC), admin.getUpdatedAt().toInstant(ZoneOffset.UTC));
        }
    }
    public record Page<T>(List<T> items, int page, int size, long totalElements, int totalPages) {}
    public record PasswordChanged(boolean requiresLogin) {}
    public record Audit(String id, String actorId, String targetId, String action, String previousRole, String newRole,
                        Boolean previousEnabled, Boolean newEnabled, Instant occurredAt) {
        public static Audit from(AccountAudit audit) {
            return new Audit(audit.getId(), audit.getActorId(), audit.getTargetId(), audit.getAction(), audit.getPreviousRole(),
                    audit.getNewRole(), audit.getPreviousEnabled(), audit.getNewEnabled(), audit.getOccurredAt().toInstant(ZoneOffset.UTC));
        }
    }
}
