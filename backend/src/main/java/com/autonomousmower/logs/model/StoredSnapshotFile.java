package com.autonomousmower.logs.model;

import java.nio.file.Path;

public record StoredSnapshotFile(
        Path relativePath,
        long fileSize
) {
}
