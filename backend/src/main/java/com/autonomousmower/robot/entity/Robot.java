package com.autonomousmower.robot.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "robot")
public class Robot {

    @Id
    @Column(name = "robot_id", length = 50, nullable = false)
    private String robotId;

    @Column(name = "model_name", length = 120, nullable = false)
    private String modelName;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected Robot() {
    }

    public Robot(String robotId, String modelName, LocalDateTime createdAt) {
        this.robotId = Objects.requireNonNull(robotId, "robotId must not be null");
        this.modelName = Objects.requireNonNull(modelName, "modelName must not be null");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt must not be null");
    }

    public String getRobotId() {
        return robotId;
    }

    public String getModelName() {
        return modelName;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
