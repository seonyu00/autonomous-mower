package com.autonomousmower.logs.service;

import com.autonomousmower.logs.config.SnapshotStorageProperties;
import com.autonomousmower.logs.model.StoredSnapshotFile;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import org.springframework.stereotype.Component;

@Component
public class SnapshotFileStorage {

    private final Path rootPath;

    public SnapshotFileStorage(SnapshotStorageProperties properties) {
        this.rootPath = properties.getStoragePath().toAbsolutePath().normalize();
    }

    public StoredSnapshotFile store(
            String robotId,
            String snapshotId,
            LocalDateTime capturedAt,
            byte[] content
    ) {
        Path relativePath = Path.of(
                robotId,
                String.valueOf(capturedAt.getYear()),
                "%02d".formatted(capturedAt.getMonthValue()),
                "%02d".formatted(capturedAt.getDayOfMonth()),
                snapshotId + ".jpg"
        );
        Path targetPath = resolveInsideRoot(relativePath);
        Path temporaryPath = targetPath.resolveSibling(targetPath.getFileName() + ".tmp");

        try {
            Files.createDirectories(targetPath.getParent());
            Files.write(temporaryPath, content);
            moveAtomically(temporaryPath, targetPath);
            return new StoredSnapshotFile(relativePath, content.length);
        } catch (IOException exception) {
            throw new UncheckedIOException("스냅샷 파일을 저장하지 못했습니다.", exception);
        } finally {
            try {
                Files.deleteIfExists(temporaryPath);
            } catch (IOException ignored) {
                // 임시 파일 정리 실패는 원래 저장 오류를 덮어쓰지 않는다.
            }
        }
    }

    public byte[] load(Path relativePath) {
        try {
            return Files.readAllBytes(resolveInsideRoot(relativePath));
        } catch (IOException exception) {
            throw new UncheckedIOException("스냅샷 파일을 읽지 못했습니다.", exception);
        }
    }

    public void delete(Path relativePath) {
        try {
            Files.deleteIfExists(resolveInsideRoot(relativePath));
        } catch (IOException exception) {
            throw new UncheckedIOException("스냅샷 파일을 삭제하지 못했습니다.", exception);
        }
    }

    private Path resolveInsideRoot(Path relativePath) {
        Path resolved = rootPath.resolve(relativePath).normalize();
        if (!resolved.startsWith(rootPath)) {
            throw new IllegalArgumentException("스냅샷 경로가 저장 루트 밖을 가리킵니다.");
        }
        return resolved;
    }

    private void moveAtomically(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
