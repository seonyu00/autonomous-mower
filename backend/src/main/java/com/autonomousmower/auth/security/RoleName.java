package com.autonomousmower.auth.security;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

public enum RoleName {
    READ_ONLY("read-only", List.of(
            Permission.ROBOTS_READ,
            Permission.TELEMETRY_READ,
            Permission.HISTORY_READ,
            Permission.LOGS_READ,
            Permission.SETTINGS_READ
    )),
    OPERATOR("operator", List.of(
            Permission.ROBOTS_READ,
            Permission.TELEMETRY_READ,
            Permission.HISTORY_READ,
            Permission.LOGS_READ,
            Permission.SETTINGS_READ,
            Permission.CONTROL_WRITE
    )),
    SUPERVISOR("supervisor", List.of(
            Permission.ROBOTS_READ,
            Permission.TELEMETRY_READ,
            Permission.HISTORY_READ,
            Permission.LOGS_READ,
            Permission.SETTINGS_READ,
            Permission.CONTROL_WRITE,
            Permission.CONTROL_TAKEOVER
    )),
    ADMIN("admin", List.of(Permission.values()));

    private final String value;
    private final List<Permission> permissions;

    RoleName(String value, List<Permission> permissions) {
        this.value = value;
        this.permissions = permissions;
    }

    public static RoleName fromValue(String value) {
        String normalized = value.toLowerCase(Locale.ROOT).replace("role_", "").replace("_", "-");
        return Arrays.stream(values())
                .filter(role -> role.value.equals(normalized))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unsupported role: " + value));
    }

    public String getValue() {
        return value;
    }

    public List<Permission> getPermissions() {
        return permissions;
    }
}
