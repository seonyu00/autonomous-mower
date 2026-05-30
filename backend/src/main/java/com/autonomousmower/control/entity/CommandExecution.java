package com.autonomousmower.control.entity;

import com.autonomousmower.robot.entity.Robot;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "command_execution")
public class CommandExecution {

    @Id
    @Column(name = "command_id", length = 120, nullable = false)
    private String commandId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "robot_id", nullable = false)
    private Robot robot;

    @Column(name = "command_type", length = 80, nullable = false)
    private String commandType;

    @Column(name = "idempotency_key", length = 160)
    private String idempotencyKey;

    @Column(name = "requested_by", length = 80, nullable = false)
    private String requestedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 40, nullable = false)
    private CommandExecutionStatus status;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;

    @Column(name = "edge_received_at")
    private Instant edgeReceivedAt;

    @Column(name = "acked_at")
    private Instant ackedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "failed_at")
    private Instant failedAt;

    @Column(name = "timeout_at")
    private Instant timeoutAt;

    @Column(name = "edge_node_id", length = 160)
    private String edgeNodeId;

    @Column(name = "reason", length = 500)
    private String reason;

    protected CommandExecution() {
    }

    public CommandExecution(
            String commandId,
            Robot robot,
            String commandType,
            String idempotencyKey,
            String requestedBy,
            Instant requestedAt,
            Instant sentAt
    ) {
        this.commandId = Objects.requireNonNull(commandId, "commandId must not be null");
        this.robot = Objects.requireNonNull(robot, "robot must not be null");
        this.commandType = Objects.requireNonNull(commandType, "commandType must not be null");
        this.idempotencyKey = idempotencyKey;
        this.requestedBy = Objects.requireNonNull(requestedBy, "requestedBy must not be null");
        this.requestedAt = Objects.requireNonNull(requestedAt, "requestedAt must not be null");
        this.sentAt = Objects.requireNonNull(sentAt, "sentAt must not be null");
        this.status = CommandExecutionStatus.SENT;
    }

    public void applyAck(
            CommandExecutionStatus nextStatus,
            String reason,
            String edgeNodeId,
            Instant edgeReceivedAt,
            Instant ackedAt
    ) {
        this.status = nextStatus;
        this.reason = reason;
        this.edgeNodeId = edgeNodeId;
        this.edgeReceivedAt = edgeReceivedAt;
        this.ackedAt = ackedAt;
        if (nextStatus == CommandExecutionStatus.COMPLETED) {
            this.completedAt = ackedAt;
        }
        if (nextStatus == CommandExecutionStatus.FAILED) {
            this.failedAt = ackedAt;
        }
    }

    public void markTimedOut(Instant timeoutAt) {
        this.status = CommandExecutionStatus.TIMED_OUT;
        this.timeoutAt = timeoutAt;
        this.reason = "ack-timeout";
    }

    public String getCommandId() {
        return commandId;
    }

    public Robot getRobot() {
        return robot;
    }

    public String getCommandType() {
        return commandType;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public CommandExecutionStatus getStatus() {
        return status;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public Instant getEdgeReceivedAt() {
        return edgeReceivedAt;
    }

    public Instant getAckedAt() {
        return ackedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public Instant getFailedAt() {
        return failedAt;
    }

    public Instant getTimeoutAt() {
        return timeoutAt;
    }

    public String getEdgeNodeId() {
        return edgeNodeId;
    }

    public String getReason() {
        return reason;
    }
}
