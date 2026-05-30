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
@Table(name = "robot_event")
public class RobotEvent {

    @Id
    @Column(name = "event_id", length = 120, nullable = false)
    private String eventId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "robot_id", nullable = false)
    private Robot robot;

    @Column(name = "severity", length = 20, nullable = false)
    private String severity;

    @Column(name = "event_type", length = 80, nullable = false)
    private String eventType;

    @Column(name = "message", length = 500, nullable = false)
    private String message;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    @Column(name = "source", length = 80, nullable = false)
    private String source;

    protected RobotEvent() {
    }

    public RobotEvent(
            String eventId,
            Robot robot,
            String severity,
            String eventType,
            String message,
            LocalDateTime occurredAt,
            String source
    ) {
        this.eventId = Objects.requireNonNull(eventId, "eventId must not be null");
        this.robot = Objects.requireNonNull(robot, "robot must not be null");
        this.severity = Objects.requireNonNull(severity, "severity must not be null");
        this.eventType = Objects.requireNonNull(eventType, "eventType must not be null");
        this.message = Objects.requireNonNull(message, "message must not be null");
        this.occurredAt = Objects.requireNonNull(occurredAt, "occurredAt must not be null");
        this.source = Objects.requireNonNull(source, "source must not be null");
    }

    public String getEventId() {
        return eventId;
    }

    public Robot getRobot() {
        return robot;
    }

    public String getSeverity() {
        return severity;
    }

    public String getEventType() {
        return eventType;
    }

    public String getMessage() {
        return message;
    }

    public LocalDateTime getOccurredAt() {
        return occurredAt;
    }

    public String getSource() {
        return source;
    }
}
