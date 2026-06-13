package com.autonomousmower.video.dto;

import java.time.Instant;

public record VideoStopResponse(
        boolean stopped,
        String robotId,
        String sessionId,
        Instant stoppedAt
) {
}
