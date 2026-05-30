package com.autonomousmower.control.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.autonomousmower.control.entity.CommandExecution;
import com.autonomousmower.control.entity.CommandExecutionStatus;
import com.autonomousmower.control.repository.CommandExecutionRepository;
import com.autonomousmower.mqtt.dto.MqttCommandAckPayload;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.realtime.dto.ControlEventMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CommandExecutionServiceTest {

    @Mock
    private CommandExecutionRepository commandExecutionRepository;

    @Mock
    private RobotRepository robotRepository;

    @Mock
    private RealtimePublisher realtimePublisher;

    private CommandExecutionService commandExecutionService;
    private final Robot robot = new Robot("MOWER-01", "Orin NX Model-A", LocalDateTime.parse("2026-05-30T00:00:00"));

    @BeforeEach
    void setUp() {
        commandExecutionService = new CommandExecutionService(
                commandExecutionRepository,
                robotRepository,
                realtimePublisher,
                Clock.fixed(Instant.parse("2026-05-31T01:00:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void markSentCreatesCommandExecutionAndPublishesSentEvent() {
        MqttCommandPayload payload = commandPayload();
        when(robotRepository.findById("MOWER-01")).thenReturn(Optional.of(robot));
        when(commandExecutionRepository.save(any(CommandExecution.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Optional<CommandExecution> execution = commandExecutionService.markSent(payload);

        assertThat(execution).isPresent();
        assertThat(execution.get().getCommandId()).isEqualTo("cmd-001");
        assertThat(execution.get().getIdempotencyKey()).isEqualTo("idem-001");
        assertThat(execution.get().getStatus()).isEqualTo(CommandExecutionStatus.SENT);

        ArgumentCaptor<ControlEventMessage> eventCaptor = ArgumentCaptor.forClass(ControlEventMessage.class);
        verify(realtimePublisher).publishControlEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue().status()).isEqualTo("SENT");
        assertThat(eventCaptor.getValue().commandId()).isEqualTo("cmd-001");
    }

    @Test
    void ackPayloadUpdatesExecutionAndPublishesAckedEvent() {
        CommandExecution execution = new CommandExecution(
                "cmd-001",
                robot,
                "stop",
                "idem-001",
                "operator",
                Instant.parse("2026-05-31T00:59:58Z"),
                Instant.parse("2026-05-31T00:59:59Z")
        );
        when(commandExecutionRepository.findByCommandId("cmd-001")).thenReturn(Optional.of(execution));

        Optional<CommandExecution> updated = commandExecutionService.applyAck(new MqttCommandAckPayload(
                "cmd-001",
                "MOWER-01",
                "stop",
                "accepted",
                null,
                "edge-mock",
                Instant.parse("2026-05-31T01:00:01Z"),
                Instant.parse("2026-05-31T01:00:02Z")
        ));

        assertThat(updated).isPresent();
        assertThat(updated.get().getStatus()).isEqualTo(CommandExecutionStatus.ACKED);
        assertThat(updated.get().getEdgeNodeId()).isEqualTo("edge-mock");
        assertThat(updated.get().getAckedAt()).isEqualTo(Instant.parse("2026-05-31T01:00:02Z"));
        verify(realtimePublisher).publishControlEvent(any(ControlEventMessage.class));
    }

    @Test
    void timeoutSchedulerMarksOldSentCommandsTimedOut() {
        CommandExecution execution = new CommandExecution(
                "cmd-timeout",
                robot,
                "stop",
                "idem-timeout",
                "operator",
                Instant.parse("2026-05-31T00:59:50Z"),
                Instant.parse("2026-05-31T00:59:54Z")
        );
        when(commandExecutionRepository.findByStatusInAndSentAtBefore(
                List.of(CommandExecutionStatus.SENT, CommandExecutionStatus.ACKED, CommandExecutionStatus.EXECUTING),
                Instant.parse("2026-05-31T00:59:55Z")
        )).thenReturn(List.of(execution));

        commandExecutionService.markTimedOutCommands();

        assertThat(execution.getStatus()).isEqualTo(CommandExecutionStatus.TIMED_OUT);
        assertThat(execution.getReason()).isEqualTo("ack-timeout");
        verify(realtimePublisher).publishControlEvent(any(ControlEventMessage.class));
    }

    private MqttCommandPayload commandPayload() {
        return new MqttCommandPayload(
                "cmd-001",
                "MOWER-01",
                "stop",
                "idem-001",
                7L,
                null,
                "operator",
                Instant.parse("2026-05-31T00:59:58Z"),
                "stop",
                Map.of("reason", "operator-stop", "speed", 0)
        );
    }
}
