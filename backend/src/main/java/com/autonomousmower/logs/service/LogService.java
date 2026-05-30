package com.autonomousmower.logs.service;

import com.autonomousmower.logs.dto.LogEntryResponse;
import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.robot.service.RobotService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class LogService {

    private final RobotService robotService;
    private final RobotEventRepository robotEventRepository;

    public LogService(RobotService robotService, RobotEventRepository robotEventRepository) {
        this.robotService = robotService;
        this.robotEventRepository = robotEventRepository;
    }

    @Transactional(readOnly = true)
    public List<LogEntryResponse> findLogs(String robotId, LocalDateTime from, LocalDateTime to, String severity) {
        boolean hasRobotId = StringUtils.hasText(robotId);
        boolean hasSeverity = StringUtils.hasText(severity) && !"all".equalsIgnoreCase(severity);
        boolean hasRange = from != null && to != null;

        if (hasRobotId) {
            robotService.getRobot(robotId);
        }

        List<RobotEvent> events;
        if (hasRobotId && hasSeverity && hasRange) {
            events = robotEventRepository.findByRobotRobotIdAndSeverityIgnoreCaseAndOccurredAtBetweenOrderByOccurredAtDesc(
                    robotId,
                    severity,
                    from,
                    to
            );
        } else if (hasRobotId && hasRange) {
            events = robotEventRepository.findByRobotRobotIdAndOccurredAtBetweenOrderByOccurredAtDesc(robotId, from, to);
        } else if (hasRobotId && hasSeverity) {
            events = robotEventRepository.findByRobotRobotIdAndSeverityIgnoreCaseOrderByOccurredAtDesc(robotId, severity);
        } else if (hasRobotId) {
            events = robotEventRepository.findByRobotRobotIdOrderByOccurredAtDesc(robotId);
        } else if (hasSeverity) {
            events = robotEventRepository.findBySeverityIgnoreCaseOrderByOccurredAtDesc(severity);
        } else {
            events = robotEventRepository.findAllByOrderByOccurredAtDesc();
        }

        return events.stream()
                .map(this::toResponse)
                .toList();
    }

    private LogEntryResponse toResponse(RobotEvent event) {
        return new LogEntryResponse(
                event.getEventId(),
                event.getRobot().getRobotId(),
                event.getSeverity(),
                event.getEventType(),
                event.getMessage(),
                event.getOccurredAt(),
                event.getSource(),
                null,
                Map.of()
        );
    }
}
