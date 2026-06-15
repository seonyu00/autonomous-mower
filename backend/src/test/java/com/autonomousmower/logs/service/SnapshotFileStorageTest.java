package com.autonomousmower.logs.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.autonomousmower.logs.config.SnapshotStorageProperties;
import com.autonomousmower.logs.model.StoredSnapshotFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SnapshotFileStorageTest {

    @TempDir
    Path tempDir;

    @Test
    void storesLoadsAndDeletesJpegInsideConfiguredRoot() throws Exception {
        SnapshotFileStorage storage = new SnapshotFileStorage(new SnapshotStorageProperties(tempDir, 1024));
        byte[] jpeg = new byte[]{(byte) 0xff, (byte) 0xd8, 1, 2, (byte) 0xff, (byte) 0xd9};

        StoredSnapshotFile stored = storage.store(
                "MOWER-01",
                "snapshot-001",
                LocalDateTime.of(2026, 6, 15, 12, 30),
                jpeg
        );

        assertThat(stored.relativePath())
                .isEqualTo(Path.of("MOWER-01", "2026", "06", "15", "snapshot-001.jpg"));
        assertThat(storage.load(stored.relativePath())).containsExactly(jpeg);

        storage.delete(stored.relativePath());

        assertThat(Files.exists(tempDir.resolve(stored.relativePath()))).isFalse();
    }

    @Test
    void rejectsPathsOutsideConfiguredRoot() {
        SnapshotFileStorage storage = new SnapshotFileStorage(new SnapshotStorageProperties(tempDir, 1024));

        assertThatThrownBy(() -> storage.load(Path.of("..", "outside.jpg")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
