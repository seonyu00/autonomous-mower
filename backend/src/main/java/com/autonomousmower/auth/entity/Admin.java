package com.autonomousmower.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "admin_account")
public class Admin {

    @Id
    @Column(name = "admin_id", length = 50, nullable = false)
    private String adminId;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "role", length = 20, nullable = false)
    private String role;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private boolean enabled = true;

    @Version
    private long version;

    @Column(name = "session_version", nullable = false)
    private long sessionVersion;

    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected Admin() {
    }

    public Admin(String adminId, String passwordHash, String role, LocalDateTime createdAt) {
        this.adminId = Objects.requireNonNull(adminId, "adminId must not be null");
        this.passwordHash = Objects.requireNonNull(passwordHash, "passwordHash must not be null");
        this.role = Objects.requireNonNull(role, "role must not be null");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt must not be null");
        this.updatedAt = createdAt;
    }

    public String getAdminId() {
        return adminId;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getRole() {
        return role;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public boolean isEnabled() { return enabled; }
    public long getVersion() { return version; }
    public long getSessionVersion() { return sessionVersion; }
    public boolean isMustChangePassword() { return mustChangePassword; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public void changeAccess(String role, boolean enabled, LocalDateTime now) {
        this.role = role;
        this.enabled = enabled;
        this.sessionVersion++;
        this.updatedAt = now;
    }

    public void changePassword(String hash, boolean temporary, LocalDateTime now) {
        this.passwordHash = hash;
        this.mustChangePassword = temporary;
        this.sessionVersion++;
        this.updatedAt = now;
    }
}
