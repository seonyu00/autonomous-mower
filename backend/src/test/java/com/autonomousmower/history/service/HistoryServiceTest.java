package com.autonomousmower.history.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.autonomousmower.history.dto.RobotHistoryResponse;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.telemetry.entity.TelemetryLog;
import com.autonomousmower.telemetry.repository.TelemetryLogRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class HistoryServiceTest {

    @Mock
    private TelemetryLogRepository telemetryLogRepository;

    @Mock
    private RobotService robotService;

    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    @Test
    void historyUsesStoredTelemetryLogsAsRouteTrack() {
        Robot robot = new Robot("MOWER-01", "Orin NX Model-A", LocalDateTime.parse("2026-05-30T00:00:00"));
        TelemetryLog first = telemetryLog(robot, 127.0001, 37.5001, "2026-05-31T01:00:00");
        TelemetryLog second = telemetryLog(robot, 127.0002, 37.5002, "2026-05-31T01:00:10");
        when(robotService.getRobot("MOWER-01")).thenReturn(robot);
        when(telemetryLogRepository.findByRobotRobotIdAndRecordedAtBetweenOrderByRecordedAtAsc(
                "MOWER-01",
                LocalDateTime.parse("2026-05-31T00:59:00"),
                LocalDateTime.parse("2026-05-31T01:01:00")
        )).thenReturn(List.of(first, second));

        HistoryService historyService = new HistoryService(telemetryLogRepository, robotService);

        List<RobotHistoryResponse> history = historyService.findHistory(
                "MOWER-01",
                LocalDateTime.parse("2026-05-31T00:59:00"),
                LocalDateTime.parse("2026-05-31T01:01:00")
        );

        assertThat(history).hasSize(1);
        assertThat(history.getFirst().route().geometry().type()).isEqualTo("LineString");
        @SuppressWarnings("unchecked")
        List<List<Double>> coordinates = (List<List<Double>>) history.getFirst().route().geometry().coordinates();
        assertThat(coordinates)
                .containsExactly(List.of(127.0001, 37.5001), List.of(127.0002, 37.5002));
    }

    private TelemetryLog telemetryLog(Robot robot, double longitude, double latitude, String recordedAt) {
        Point point = geometryFactory.createPoint(new Coordinate(longitude, latitude));
        point.setSRID(4326);
        return new TelemetryLog(robot, point, 82, "MOWING", LocalDateTime.parse(recordedAt));
    }
}
