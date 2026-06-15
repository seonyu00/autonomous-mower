package com.autonomousmower.logs.dto;

import java.time.Instant;

public record SaveSnapshotResponse(
        String snapshotId,
        String robotId,
        String captureType,
        Instant capturedAt,
        String contentType,
        long fileSize,
        String url
) {
}
