package com.autonomousmower.control.service;

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
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommandExecutionService {

    private static final Logger log = LoggerFactory.getLogger(CommandExecutionService.class);
    private static final Duration DEFAULT_ACK_TIMEOUT = Duration.ofSeconds(5);
    private static final List<CommandExecutionStatus> TIMEOUT_CANDIDATES = List.of(
            CommandExecutionStatus.SENT,
            CommandExecutionStatus.ACKED,
            CommandExecutionStatus.EXECUTING
    );

    private final CommandExecutionRepository commandExecutionRepository;
    private final RobotRepository robotRepository;
    private final RealtimePublisher realtimePublisher;
    private final Clock clock;

    public CommandExecutionService(
            CommandExecutionRepository commandExecutionRepository,
            RobotRepository robotRepository,
            RealtimePublisher realtimePublisher,
            Clock clock
    ) {
        this.commandExecutionRepository = commandExecutionRepository;
        this.robotRepository = robotRepository;
        this.realtimePublisher = realtimePublisher;
        this.clock = clock;
    }

    @Transactional
    public Optional<CommandExecution> markSent(MqttCommandPayload payload) {
        Optional<Robot> robot = robotRepository.findById(payload.robotId());
        if (robot.isEmpty()) {
            log.warn("Skipping command execution tracking for unknown robotId={}", payload.robotId());
            return Optional.empty();
        }

        CommandExecution execution = commandExecutionRepository.save(new CommandExecution(
                payload.commandId(),
                robot.get(),
                payload.commandType(),
                payload.idempotencyKey(),
                payload.requestedBy(),
                payload.requestedAt(),
                Instant.now(clock)
        ));
        publish(execution);
        return Optional.of(execution);
    }

    @Transactional
    public Optional<CommandExecution> applyAck(MqttCommandAckPayload payload) {
        Optional<CommandExecution> execution = commandExecutionRepository.findByCommandId(payload.commandId());
        if (execution.isEmpty()) {
            log.warn(
                    "Ignoring MQTT command ack for unknown commandId={} robotId={}",
                    payload.commandId(),
                    payload.robotId()
            );
            return Optional.empty();
        }

        CommandExecution command = execution.get();
        CommandExecutionStatus status = mapAckStatus(payload.status());
        Instant ackedAt = payload.ackedAt() == null ? Instant.now(clock) : payload.ackedAt();
        command.applyAck(status, payload.reason(), payload.edgeNodeId(), payload.receivedAt(), ackedAt);
        publish(command);
        return Optional.of(command);
    }

    @Scheduled(fixedDelay = 1000)
    @Transactional
    public void markTimedOutCommands() {
        Instant now = Instant.now(clock);
        Instant sentBefore = now.minus(DEFAULT_ACK_TIMEOUT);
        for (CommandExecution execution : commandExecutionRepository.findByStatusInAndSentAtBefore(
                TIMEOUT_CANDIDATES,
                sentBefore
        )) {
            execution.markTimedOut(now);
            publish(execution);
        }
    }

    private CommandExecutionStatus mapAckStatus(String status) {
        if (status == null) {
            return CommandExecutionStatus.ACKED;
        }
        return switch (status.toLowerCase(Locale.ROOT)) {
            case "accepted", "acked" -> CommandExecutionStatus.ACKED;
            case "executing" -> CommandExecutionStatus.EXECUTING;
            case "executed", "completed" -> CommandExecutionStatus.COMPLETED;
            case "rejected", "failed" -> CommandExecutionStatus.FAILED;
            case "timed_out", "timeout", "timed-out" -> CommandExecutionStatus.TIMED_OUT;
            default -> CommandExecutionStatus.ACKED;
        };
    }

    private void publish(CommandExecution execution) {
        realtimePublisher.publishControlEvent(new ControlEventMessage(
                execution.getRobot().getRobotId(),
                execution.getCommandId(),
                execution.getCommandType(),
                execution.getStatus().name(),
                execution.getReason(),
                execution.getRequestedBy(),
                Instant.now(clock),
                execution.getAckedAt()
        ));
    }
}
