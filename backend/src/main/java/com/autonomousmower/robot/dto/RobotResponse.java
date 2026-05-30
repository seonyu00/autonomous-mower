package com.autonomousmower.robot.dto;

import com.autonomousmower.robot.entity.Robot;
import java.time.LocalDateTime;

public record RobotResponse(
        String id,
        String modelName,
        String connectionState,
        boolean active,
        LocalDateTime lastSeenAt,
        ControlSummaryResponse control
) {
    public static RobotResponse summary(Robot robot) {
        return new RobotResponse(
                robot.getRobotId(),
                robot.getModelName(),
                "offline",
                robot.isEnabled(),
                null,
                null
        );
    }

    public static RobotResponse detail(Robot robot) {
        return new RobotResponse(
                robot.getRobotId(),
                robot.getModelName(),
                "offline",
                robot.isEnabled(),
                null,
                ControlSummaryResponse.placeholder()
        );
    }
}
