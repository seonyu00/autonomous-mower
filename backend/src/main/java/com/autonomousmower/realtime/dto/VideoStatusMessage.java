package com.autonomousmower.realtime.dto;

import java.time.Instant;

public record VideoStatusMessage(
        String robotId,
        String sessionId,
        String state,
        int fps,
        int width,
        int height,
        int bitrateKbps,
        String codec,
        String error,
        Instant updatedAt
) {
}
