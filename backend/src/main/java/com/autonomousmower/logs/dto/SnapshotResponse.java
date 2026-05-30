package com.autonomousmower.logs.dto;

import java.time.LocalDateTime;

public record SnapshotResponse(
        String id,
        LocalDateTime capturedAt,
        String contentType,
        String url
) {
}
