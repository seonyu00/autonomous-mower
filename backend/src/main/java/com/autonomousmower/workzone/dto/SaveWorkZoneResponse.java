package com.autonomousmower.workzone.dto;

import java.time.LocalDateTime;

public record SaveWorkZoneResponse(
        boolean saved,
        String robotId,
        Long zoneId,
        int version,
        LocalDateTime updatedAt
) {
}
