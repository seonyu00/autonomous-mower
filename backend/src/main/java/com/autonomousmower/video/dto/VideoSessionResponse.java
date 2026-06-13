package com.autonomousmower.video.dto;

import java.time.Instant;

public record VideoSessionResponse(
        String sessionId,
        String robotId,
        String whepUrl,
        String state,
        Instant createdAt
) {
}
