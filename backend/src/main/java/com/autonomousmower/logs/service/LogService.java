package com.autonomousmower.logs.service;

import com.autonomousmower.logs.dto.LogEntryResponse;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.logs.dto.SnapshotResponse;
import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.robot.service.RobotService;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
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
    public List<LogEntryResponse> findLogs(
            String robotId,
            LocalDateTime from,
            LocalDateTime to,
            String severity,
            String text
    ) {
        boolean hasRobotId = StringUtils.hasText(robotId);
        boolean hasSeverity = StringUtils.hasText(severity) && !"all".equalsIgnoreCase(severity);
        boolean hasRange = from != null || to != null;
        if (from != null && to != null && from.isAfter(to)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        String normalizedText = StringUtils.hasText(text) ? text.trim().toLowerCase(Locale.ROOT) : "";

        if (hasRobotId) {
            robotService.getRobot(robotId);
        }

        List<RobotEvent> events;
        if (hasRange) {
            events = robotEventRepository.findInDateRange(
                    hasRobotId ? robotId : null, hasSeverity ? severity : null, from, to);
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
                .filter(event -> normalizedText.isEmpty() || containsText(event, normalizedText))
                .map(this::toResponse)
                .toList();
    }

    private boolean containsText(RobotEvent event, String text) {
        return event.getMessage().toLowerCase(Locale.ROOT).contains(text)
                || event.getEventType().toLowerCase(Locale.ROOT).contains(text)
                || event.getSource().toLowerCase(Locale.ROOT).contains(text);
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
                event.getSnapshot() == null
                        ? null
                        : new SnapshotResponse(
                                event.getSnapshot().getSnapshotId(),
                                event.getSnapshot().getCapturedAt().toInstant(ZoneOffset.UTC),
                                event.getSnapshot().getContentType(),
                                "/api/logs/snapshots/" + event.getSnapshot().getSnapshotId()
                        ),
                Map.of()
        );
    }
}
