package com.autonomousmower.realtime.dto;

import java.time.Instant;

public record ControlEventMessage(
        String robotId,
        String commandId,
        String commandType,
        String status,
        String reason,
        String requestedBy,
        Instant serverTimestamp,
        Instant edgeAckAt
) {
}
