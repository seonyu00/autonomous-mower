package com.autonomousmower.logs.model;

public record SnapshotContent(
        byte[] content,
        String contentType
) {
}
