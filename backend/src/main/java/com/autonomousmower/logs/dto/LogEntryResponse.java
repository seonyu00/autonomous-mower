package com.autonomousmower.logs.dto;

import java.time.LocalDateTime;
import java.util.Map;

public record LogEntryResponse(
        String id,
        String robotId,
        String severity,
        String eventType,
        String message,
        LocalDateTime occurredAt,
        String source,
        SnapshotResponse snapshot,
        Map<String, Object> metadata
) {
}
