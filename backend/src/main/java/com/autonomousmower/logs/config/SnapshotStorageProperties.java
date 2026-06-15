package com.autonomousmower.logs.config;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.snapshot")
public class SnapshotStorageProperties {

    private Path storagePath = Path.of("./data/snapshots");
    private long maxBytes = 5 * 1024 * 1024;

    public SnapshotStorageProperties() {
    }

    public SnapshotStorageProperties(Path storagePath, long maxBytes) {
        this.storagePath = storagePath;
        this.maxBytes = maxBytes;
    }

    public Path getStoragePath() {
        return storagePath;
    }

    public void setStoragePath(Path storagePath) {
        this.storagePath = storagePath;
    }

    public long getMaxBytes() {
        return maxBytes;
    }

    public void setMaxBytes(long maxBytes) {
        this.maxBytes = maxBytes;
    }
}
