package com.autonomousmower.logs.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.logs.config.SnapshotStorageProperties;
import com.autonomousmower.logs.dto.SaveSnapshotResponse;
import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.entity.RobotSnapshot;
import com.autonomousmower.logs.model.StoredSnapshotFile;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.logs.repository.RobotSnapshotRepository;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import java.nio.file.Path;
import java.io.UncheckedIOException;
import java.nio.file.NoSuchFileException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@ExtendWith(MockitoExtension.class)
class SnapshotServiceTest {

    private static final byte[] JPEG = new byte[]{
            (byte) 0xff, (byte) 0xd8, 1, 2, (byte) 0xff, (byte) 0xd9
    };

    @Mock
    private RobotService robotService;

    @Mock
    private RobotSnapshotRepository snapshotRepository;

    @Mock
    private RobotEventRepository eventRepository;

    @Mock
    private SnapshotFileStorage fileStorage;

    private SnapshotService service;

    @BeforeEach
    void setUp() {
        service = new SnapshotService(
                robotService,
                snapshotRepository,
                eventRepository,
                fileStorage,
                new SnapshotStorageProperties(Path.of("./data/snapshots"), 1024),
                Clock.fixed(Instant.parse("2026-06-15T12:30:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void savesManualSnapshotAndCreatesLinkedRobotEvent() {
        Robot robot = new Robot("MOWER-01", "Orin NX Model-A", LocalDateTime.parse("2026-05-30T00:00:00"));
        when(robotService.getRobot("MOWER-01")).thenReturn(robot);
        when(fileStorage.store(any(), any(), any(), any()))
                .thenReturn(new StoredSnapshotFile(Path.of("MOWER-01", "snapshot.jpg"), JPEG.length));

        SaveSnapshotResponse response = service.save(
                "MOWER-01",
                "manual",
                Instant.parse("2026-06-15T12:29:58Z"),
                new MockMultipartFile("file", "snapshot.jpg", "image/jpeg", JPEG)
        );

        ArgumentCaptor<RobotSnapshot> snapshotCaptor = ArgumentCaptor.forClass(RobotSnapshot.class);
        ArgumentCaptor<RobotEvent> eventCaptor = ArgumentCaptor.forClass(RobotEvent.class);
        verify(snapshotRepository).save(snapshotCaptor.capture());
        verify(eventRepository).save(eventCaptor.capture());

        RobotSnapshot snapshot = snapshotCaptor.getValue();
        RobotEvent event = eventCaptor.getValue();
        assertThat(snapshot.getCaptureType()).isEqualTo("manual");
        assertThat(snapshot.getCapturedAt()).isEqualTo(LocalDateTime.parse("2026-06-15T12:29:58"));
        assertThat(event.getEventType()).isEqualTo("manual-snapshot");
        assertThat(event.getSeverity()).isEqualTo("info");
        assertThat(event.getSource()).isEqualTo("dashboard");
        assertThat(event.getSnapshot()).isSameAs(snapshot);
        assertThat(response.snapshotId()).isEqualTo(snapshot.getSnapshotId());
        assertThat(response.url()).isEqualTo("/api/logs/snapshots/" + snapshot.getSnapshotId());
    }

    @Test
    void rejectsNonJpegContent() {
        MockMultipartFile file = new MockMultipartFile("file", "snapshot.png", "image/png", new byte[]{1, 2});

        assertThatThrownBy(() -> service.save(
                "MOWER-01",
                "manual",
                Instant.parse("2026-06-15T12:29:58Z"),
                file
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_SNAPSHOT);
    }

    @Test
    void deletesStoredFileWhenDatabaseWriteFails() {
        Robot robot = new Robot("MOWER-01", "Orin NX Model-A", LocalDateTime.parse("2026-05-30T00:00:00"));
        Path relativePath = Path.of("MOWER-01", "snapshot.jpg");
        when(robotService.getRobot("MOWER-01")).thenReturn(robot);
        when(fileStorage.store(any(), any(), any(), any()))
                .thenReturn(new StoredSnapshotFile(relativePath, JPEG.length));
        doThrow(new IllegalStateException("database unavailable"))
                .when(snapshotRepository).save(any(RobotSnapshot.class));

        assertThatThrownBy(() -> service.save(
                "MOWER-01",
                "manual",
                Instant.parse("2026-06-15T12:29:58Z"),
                new MockMultipartFile("file", "snapshot.jpg", "image/jpeg", JPEG)
        )).isInstanceOf(IllegalStateException.class);

        verify(fileStorage).delete(relativePath);
    }

    @Test
    void deletesStoredFileWhenTransactionRollsBackAfterServiceReturns() {
        Robot robot = new Robot("MOWER-01", "Orin NX Model-A", LocalDateTime.parse("2026-05-30T00:00:00"));
        Path relativePath = Path.of("MOWER-01", "snapshot.jpg");
        when(robotService.getRobot("MOWER-01")).thenReturn(robot);
        when(fileStorage.store(any(), any(), any(), any()))
                .thenReturn(new StoredSnapshotFile(relativePath, JPEG.length));
        TransactionSynchronizationManager.initSynchronization();

        try {
            service.save(
                    "MOWER-01",
                    "manual",
                    Instant.parse("2026-06-15T12:29:58Z"),
                    new MockMultipartFile("file", "snapshot.jpg", "image/jpeg", JPEG)
            );

            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(synchronization -> synchronization.afterCompletion(
                            TransactionSynchronization.STATUS_ROLLED_BACK
                    ));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        verify(fileStorage).delete(relativePath);
    }

    @Test
    void reportsSnapshotNotFoundWhenMetadataExistsButFileIsMissing() {
        Robot robot = new Robot("MOWER-01", "Orin NX Model-A", LocalDateTime.parse("2026-05-30T00:00:00"));
        RobotSnapshot snapshot = new RobotSnapshot(
                "snapshot-001",
                robot,
                "manual",
                LocalDateTime.parse("2026-06-15T12:29:58"),
                "image/jpeg",
                JPEG.length,
                "MOWER-01/snapshot-001.jpg",
                LocalDateTime.parse("2026-06-15T12:30:00")
        );
        when(snapshotRepository.findById("snapshot-001")).thenReturn(java.util.Optional.of(snapshot));
        when(fileStorage.load(Path.of("MOWER-01/snapshot-001.jpg")))
                .thenThrow(new UncheckedIOException(new NoSuchFileException("snapshot-001.jpg")));

        assertThatThrownBy(() -> service.load("snapshot-001"))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.SNAPSHOT_NOT_FOUND);
    }
}
