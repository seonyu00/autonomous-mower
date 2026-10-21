package com.autonomousmower.history.service;

import com.autonomousmower.history.dto.GeoJsonFeatureDto;
import com.autonomousmower.history.dto.GeometryDto;
import com.autonomousmower.history.dto.RobotHistoryResponse;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.telemetry.entity.TelemetryLog;
import com.autonomousmower.telemetry.repository.TelemetryLogRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.locationtech.jts.geom.Point;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HistoryService {

    private final TelemetryLogRepository telemetryLogRepository;
    private final RobotService robotService;

    public HistoryService(TelemetryLogRepository telemetryLogRepository, RobotService robotService) {
        this.telemetryLogRepository = telemetryLogRepository;
        this.robotService = robotService;
    }

    @Transactional(readOnly = true)
    public List<RobotHistoryResponse> findHistory(String robotId, LocalDateTime from, LocalDateTime to) {
        robotService.getRobot(robotId);
        List<TelemetryLog> logs = from == null || to == null
                ? telemetryLogRepository.findByRobotRobotIdOrderByRecordedAtAsc(robotId)
                : telemetryLogRepository.findByRobotRobotIdAndRecordedAtBetweenOrderByRecordedAtAsc(robotId, from, to);
        if (logs.isEmpty()) {
            return List.of();
        }

        List<List<Double>> coordinates = logs.stream()
                .map(TelemetryLog::getLocationPoint)
                .filter(Objects::nonNull)
                .map(this::toPosition)
                .toList();
        // 위치가 없는 수신 기록을 지도 원점이나 임의 경로로 바꾸지 않는다.
        if (coordinates.isEmpty()) {
            return List.of();
        }
        GeoJsonFeatureDto route = new GeoJsonFeatureDto(
                "Feature",
                coordinates.size() == 1 ? new GeometryDto("Point", coordinates.getFirst()) : GeometryDto.lineString(coordinates),
                Map.of("srid", 4326)
        );
        TelemetryLog first = logs.getFirst();
        TelemetryLog last = logs.getLast();
        return List.of(new RobotHistoryResponse(
                "history-" + robotId + "-" + first.getLogId(),
                robotId,
                first.getRecordedAt(),
                last.getRecordedAt(),
                route,
                List.of(),
                null,
                null
        ));
    }

    private List<Double> toPosition(Point point) {
        return List.of(point.getX(), point.getY());
    }
}
