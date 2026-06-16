package com.autonomousmower.logs.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.logs.config.SnapshotStorageProperties;
import com.autonomousmower.logs.dto.SaveSnapshotResponse;
import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.entity.RobotSnapshot;
import com.autonomousmower.logs.model.SnapshotContent;
import com.autonomousmower.logs.model.StoredSnapshotFile;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.logs.repository.RobotSnapshotRepository;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
public class SnapshotService {

    private static final String JPEG_CONTENT_TYPE = "image/jpeg";

    private final RobotService robotService;
    private final RobotSnapshotRepository snapshotRepository;
    private final RobotEventRepository eventRepository;
    private final SnapshotFileStorage fileStorage;
    private final SnapshotStorageProperties properties;
    private final Clock clock;

    @Autowired
    public SnapshotService(
            RobotService robotService,
            RobotSnapshotRepository snapshotRepository,
            RobotEventRepository eventRepository,
            SnapshotFileStorage fileStorage,
            SnapshotStorageProperties properties
    ) {
        this(robotService, snapshotRepository, eventRepository, fileStorage, properties, Clock.systemUTC());
    }

    SnapshotService(
            RobotService robotService,
            RobotSnapshotRepository snapshotRepository,
            RobotEventRepository eventRepository,
            SnapshotFileStorage fileStorage,
            SnapshotStorageProperties properties,
            Clock clock
    ) {
        this.robotService = robotService;
        this.snapshotRepository = snapshotRepository;
        this.eventRepository = eventRepository;
        this.fileStorage = fileStorage;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public SaveSnapshotResponse save(
            String robotId,
            String captureType,
            Instant capturedAt,
            MultipartFile file
    ) {
        validate(captureType, file);
        Robot robot = robotService.getRobot(robotId);
        String snapshotId = UUID.randomUUID().toString();
        LocalDateTime capturedAtUtc = LocalDateTime.ofInstant(capturedAt, ZoneOffset.UTC);
        byte[] content = readContent(file);
        validateJpegSignature(content);

        StoredSnapshotFile stored = fileStorage.store(robotId, snapshotId, capturedAtUtc, content);
        registerRollbackCleanup(stored.relativePath());
        try {
            LocalDateTime createdAt = LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
            RobotSnapshot snapshot = new RobotSnapshot(
                    snapshotId,
                    robot,
                    captureType.toLowerCase(Locale.ROOT),
                    capturedAtUtc,
                    JPEG_CONTENT_TYPE,
                    stored.fileSize(),
                    toPortablePath(stored.relativePath()),
                    createdAt
            );
            snapshotRepository.save(snapshot);

            RobotEvent event = new RobotEvent(
                    UUID.randomUUID().toString(),
                    robot,
                    "info",
                    "manual-snapshot",
                    "수동 스냅샷을 저장했습니다.",
                    capturedAtUtc,
                    "dashboard"
            );
            event.attachSnapshot(snapshot);
            eventRepository.save(event);

            return new SaveSnapshotResponse(
                    snapshotId,
                    robotId,
                    snapshot.getCaptureType(),
                    capturedAt,
                    JPEG_CONTENT_TYPE,
                    stored.fileSize(),
                    snapshotUrl(snapshotId)
            );
        } catch (RuntimeException exception) {
            cleanupStoredFile(stored.relativePath(), exception);
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public SnapshotContent load(String snapshotId) {
        RobotSnapshot snapshot = snapshotRepository.findById(snapshotId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SNAPSHOT_NOT_FOUND));
        try {
            return new SnapshotContent(
                    fileStorage.load(Path.of(snapshot.getRelativePath())),
                    snapshot.getContentType()
            );
        } catch (UncheckedIOException exception) {
            throw new BusinessException(ErrorCode.SNAPSHOT_NOT_FOUND);
        }
    }

    private void validate(String captureType, MultipartFile file) {
        if (!"manual".equalsIgnoreCase(captureType)
                || file == null
                || file.isEmpty()
                || file.getSize() > properties.getMaxBytes()
                || !JPEG_CONTENT_TYPE.equalsIgnoreCase(file.getContentType())) {
            throw new BusinessException(ErrorCode.INVALID_SNAPSHOT);
        }
    }

    private byte[] readContent(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.INVALID_SNAPSHOT);
        }
    }

    private void validateJpegSignature(byte[] content) {
        if (content.length < 4
                || content[0] != (byte) 0xff
                || content[1] != (byte) 0xd8
                || content[content.length - 2] != (byte) 0xff
                || content[content.length - 1] != (byte) 0xd9) {
            throw new BusinessException(ErrorCode.INVALID_SNAPSHOT);
        }
    }

    private void cleanupStoredFile(Path relativePath, RuntimeException original) {
        try {
            fileStorage.delete(relativePath);
        } catch (RuntimeException cleanupFailure) {
            original.addSuppressed(cleanupFailure);
        }
    }

    private void registerRollbackCleanup(Path relativePath) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    fileStorage.delete(relativePath);
                }
            }
        });
    }

    private String toPortablePath(Path path) {
        return path.toString().replace('\\', '/');
    }

    private String snapshotUrl(String snapshotId) {
        return "/api/logs/snapshots/" + snapshotId;
    }
}
