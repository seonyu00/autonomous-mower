package com.autonomousmower.telemetry.entity;

import com.autonomousmower.robot.entity.Robot;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import org.locationtech.jts.geom.Point;

@Entity
@Table(name = "telemetry_log")
public class TelemetryLog {

    private static final int BATTERY_CRITICAL_THRESHOLD = 20;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "log_id")
    private Long logId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "robot_id", nullable = false)
    private Robot robot;

    @Column(name = "location_point", nullable = false, columnDefinition = "geometry(Point, 4326)")
    private Point locationPoint;

    @Column(name = "battery_level", nullable = false)
    private int batteryLevel;

    @Column(name = "robot_state", length = 20, nullable = false)
    private String robotState;

    @Column(name = "recorded_at", nullable = false)
    private LocalDateTime recordedAt;

    protected TelemetryLog() {
    }

    public TelemetryLog(Robot robot, Point locationPoint, int batteryLevel, String robotState, LocalDateTime recordedAt) {
        this.robot = Objects.requireNonNull(robot, "robot must not be null");
        this.locationPoint = Objects.requireNonNull(locationPoint, "locationPoint must not be null");
        this.batteryLevel = batteryLevel;
        this.robotState = Objects.requireNonNull(robotState, "robotState must not be null");
        this.recordedAt = Objects.requireNonNull(recordedAt, "recordedAt must not be null");
    }

    public boolean isBatteryCritical() {
        return batteryLevel <= BATTERY_CRITICAL_THRESHOLD;
    }

    public boolean isErrorState() {
        return "ERROR".equalsIgnoreCase(robotState);
    }

    public Long getLogId() {
        return logId;
    }

    public Robot getRobot() {
        return robot;
    }

    public Point getLocationPoint() {
        return locationPoint;
    }

    public int getBatteryLevel() {
        return batteryLevel;
    }

    public String getRobotState() {
        return robotState;
    }

    public LocalDateTime getRecordedAt() {
        return recordedAt;
    }
}
