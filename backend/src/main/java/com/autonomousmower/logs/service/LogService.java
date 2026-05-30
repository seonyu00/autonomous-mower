package com.autonomousmower.logs.service;

import com.autonomousmower.logs.dto.LogEntryResponse;
import com.autonomousmower.robot.service.RobotService;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class LogService {

    private final RobotService robotService;

    public LogService(RobotService robotService) {
        this.robotService = robotService;
    }

    public List<LogEntryResponse> findLogs(String robotId, LocalDateTime from, LocalDateTime to, String severity) {
        if (robotId != null && !robotId.isBlank()) {
            robotService.getRobot(robotId);
        }
        return List.of();
    }
}
