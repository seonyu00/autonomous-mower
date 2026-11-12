package com.autonomousmower.realtime.dto;

import java.time.Instant;
import com.autonomousmower.telemetry.dto.TelemetryReception;

public record RobotStatusMessage(
        String robotId,
        String connectionState,
        String mqttState,
        String wssState,
        String edgeState,
        Instant lastSeenAt,
        boolean stale,
        TelemetryReception telemetryReception,
        String manualLockReason
) {
    public RobotStatusMessage(String robotId, String connectionState, String mqttState, String wssState,
                             String edgeState, Instant lastSeenAt, boolean stale, TelemetryReception telemetryReception) {
        this(robotId, connectionState, mqttState, wssState, edgeState, lastSeenAt, stale, telemetryReception, null);
    }
}
