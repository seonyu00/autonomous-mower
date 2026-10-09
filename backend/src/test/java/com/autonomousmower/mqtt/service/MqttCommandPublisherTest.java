package com.autonomousmower.mqtt.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.autonomousmower.control.service.CommandExecutionService;
import com.autonomousmower.control.entity.CommandExecution;
import com.autonomousmower.control.entity.CommandExecutionStatus;
import com.autonomousmower.control.repository.CommandExecutionRepository;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.mqtt.dto.MqttCommandAckPayload;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.realtime.service.RealtimePublisher;
import com.autonomousmower.mqtt.transport.MqttTransport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class MqttCommandPublisherTest {
    @Test
    void immediateAckDuringFakePublishFindsRegistrationAndCannotBeOverwrittenBySent() {
        var repository = mock(CommandExecutionRepository.class);
        var robots = mock(RobotRepository.class);
        Map<String, CommandExecution> rows = new HashMap<>();
        when(robots.findById("A")).thenReturn(Optional.of(new Robot("A", "test", LocalDateTime.now())));
        when(repository.saveAndFlush(any())).thenAnswer(call -> {
            CommandExecution execution = call.getArgument(0);
            rows.put(execution.getCommandId(), execution);
            return execution;
        });
        when(repository.findByCommandId("cmd")).thenAnswer(call -> Optional.ofNullable(rows.get("cmd")));
        var tracking = new CommandExecutionService(repository, robots, mock(RealtimePublisher.class), Clock.systemUTC());
        MqttTransport fake = (topic, bytes, qos, retained) -> {
            assertThat(rows.get("cmd").getStatus()).isEqualTo(CommandExecutionStatus.PREPARED);
            tracking.applyAck(new MqttCommandAckPayload("cmd", "A", "stop", "accepted", null, "fake", null, Instant.now()));
        };
        new MqttCommandPublisher(fake, new MqttTopicResolver(), new ObjectMapper().findAndRegisterModules(), tracking).publishStopCommand(payload());
        assertThat(rows.get("cmd").getStatus()).isEqualTo(CommandExecutionStatus.ACKED);
        assertThat(rows.get("cmd").getCompletedAt()).isNull();
    }

    @Test
    void transportFailureIsRecordedAndPropagatedWithoutSent() {
        var tracking = mock(CommandExecutionService.class);
        var transport = mock(MqttTransport.class);
        doThrow(new IllegalStateException("fake publish failure")).when(transport).publish(any(), any(), anyInt(), anyBoolean());
        var publisher = new MqttCommandPublisher(transport, new MqttTopicResolver(), new ObjectMapper().findAndRegisterModules(), tracking);
        assertThatThrownBy(() -> publisher.publishStopCommand(payload())).isInstanceOf(IllegalStateException.class);
        var order = inOrder(tracking, transport);
        order.verify(tracking).register(any());
        order.verify(transport).publish(any(), any(), anyInt(), anyBoolean());
        order.verify(tracking).markPublishFailed("cmd");
        verify(tracking, never()).markSent(any());
    }

    private MqttCommandPayload payload() {
        return new MqttCommandPayload("cmd", "A", "stop", "key", 1L, null, "owner", Instant.now(), "stop", Map.of("speed", 0));
    }
}
