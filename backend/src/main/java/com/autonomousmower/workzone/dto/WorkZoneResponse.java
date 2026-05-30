package com.autonomousmower.workzone.dto;

import java.time.LocalDateTime;

public record WorkZoneResponse(
        Long zoneId,
        String robotId,
        int version,
        LocalDateTime updatedAt,
        WorkZonePayload zone
) {
}
