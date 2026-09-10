package com.autonomousmower.robot.dto;

import com.autonomousmower.robot.entity.Robot;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import com.autonomousmower.telemetry.dto.TelemetryReception;

public record RobotResponse(
        String id,
        String modelName,
        String connectionState,
        boolean active,
        LocalDateTime lastSeenAt,
        ControlSummaryResponse control,
        TelemetryReception telemetryReception
) {
    public static RobotResponse summary(Robot robot, TelemetryReception reception) {
        return new RobotResponse(
                robot.getRobotId(),
                robot.getModelName(),
                "normal".equals(reception.state()) ? "online" : "delayed".equals(reception.state()) ? "degraded" : "offline",
                robot.isEnabled(),
                reception.lastReceivedAt() == null ? null : LocalDateTime.ofInstant(reception.lastReceivedAt(), ZoneOffset.UTC),
                null,
                reception
        );
    }

    public static RobotResponse detail(Robot robot, TelemetryReception reception) {
        return new RobotResponse(
                robot.getRobotId(),
                robot.getModelName(),
                "normal".equals(reception.state()) ? "online" : "delayed".equals(reception.state()) ? "degraded" : "offline",
                robot.isEnabled(),
                reception.lastReceivedAt() == null ? null : LocalDateTime.ofInstant(reception.lastReceivedAt(), ZoneOffset.UTC),
                ControlSummaryResponse.placeholder(),
                reception
        );
    }
}
