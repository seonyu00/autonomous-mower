package com.autonomousmower.auth.security;

public enum Permission {
    ROBOTS_READ("robots:read"),
    TELEMETRY_READ("telemetry:read"),
    HISTORY_READ("history:read"),
    LOGS_READ("logs:read"),
    SETTINGS_READ("settings:read"),
    ACCOUNTS_READ("accounts:read"),
    ACCOUNTS_WRITE("accounts:write"),
    CONTROL_WRITE("control:write"),
    CONTROL_TAKEOVER("control:takeover");

    private final String value;

    Permission(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
