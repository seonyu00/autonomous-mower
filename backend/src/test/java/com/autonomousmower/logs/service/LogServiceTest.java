package com.autonomousmower.logs.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.autonomousmower.logs.dto.LogEntryResponse;
import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class LogServiceTest {

    @Mock
    private RobotService robotService;

    @Mock
    private RobotEventRepository robotEventRepository;

    @Test
    void logsAreReadFromPersistedRobotEvents() {
        Robot robot = new Robot("MOWER-01", "Orin NX Model-A", LocalDateTime.parse("2026-05-30T00:00:00"));
        RobotEvent event = new RobotEvent(
                "event-001",
                robot,
                "critical",
                "estop",
                "Emergency stop is active.",
                LocalDateTime.parse("2026-05-31T01:00:00"),
                "edge-mock"
        );
        when(robotService.getRobot("MOWER-01")).thenReturn(robot);
        when(robotEventRepository.findByRobotRobotIdAndSeverityIgnoreCaseOrderByOccurredAtDesc("MOWER-01", "critical"))
                .thenReturn(List.of(event));

        LogService logService = new LogService(robotService, robotEventRepository);

        List<LogEntryResponse> logs = logService.findLogs("MOWER-01", null, null, "critical");

        assertThat(logs).hasSize(1);
        assertThat(logs.getFirst().id()).isEqualTo("event-001");
        assertThat(logs.getFirst().robotId()).isEqualTo("MOWER-01");
        assertThat(logs.getFirst().severity()).isEqualTo("critical");
        assertThat(logs.getFirst().eventType()).isEqualTo("estop");
    }
}
