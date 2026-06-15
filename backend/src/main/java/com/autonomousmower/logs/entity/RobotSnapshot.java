package com.autonomousmower.logs.entity;

import com.autonomousmower.robot.entity.Robot;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "robot_snapshot")
public class RobotSnapshot {

    @Id
    @Column(name = "snapshot_id", length = 120, nullable = false)
    private String snapshotId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "robot_id", nullable = false)
    private Robot robot;

    @Column(name = "capture_type", length = 20, nullable = false)
    private String captureType;

    @Column(name = "captured_at", nullable = false)
    private LocalDateTime capturedAt;

    @Column(name = "content_type", length = 80, nullable = false)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(name = "relative_path", length = 500, nullable = false, unique = true)
    private String relativePath;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected RobotSnapshot() {
    }

    public RobotSnapshot(
            String snapshotId,
            Robot robot,
            String captureType,
            LocalDateTime capturedAt,
            String contentType,
            long fileSize,
            String relativePath,
            LocalDateTime createdAt
    ) {
        this.snapshotId = Objects.requireNonNull(snapshotId, "snapshotId must not be null");
        this.robot = Objects.requireNonNull(robot, "robot must not be null");
        this.captureType = Objects.requireNonNull(captureType, "captureType must not be null");
        this.capturedAt = Objects.requireNonNull(capturedAt, "capturedAt must not be null");
        this.contentType = Objects.requireNonNull(contentType, "contentType must not be null");
        this.fileSize = fileSize;
        this.relativePath = Objects.requireNonNull(relativePath, "relativePath must not be null");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt must not be null");
    }

    public String getSnapshotId() {
        return snapshotId;
    }

    public Robot getRobot() {
        return robot;
    }

    public String getCaptureType() {
        return captureType;
    }

    public LocalDateTime getCapturedAt() {
        return capturedAt;
    }

    public String getContentType() {
        return contentType;
    }

    public long getFileSize() {
        return fileSize;
    }

    public String getRelativePath() {
        return relativePath;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
