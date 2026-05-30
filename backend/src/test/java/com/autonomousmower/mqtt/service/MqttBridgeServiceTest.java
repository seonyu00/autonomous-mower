package com.autonomousmower.mqtt.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import com.autonomousmower.control.service.CommandExecutionService;
import com.autonomousmower.mqtt.dto.MqttCommandAckPayload;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.autonomousmower.mqtt.transport.MqttTransport;
import com.autonomousmower.realtime.dto.TelemetryMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class MqttBridgeServiceTest {

    @Test
    void inboundTelemetryPublishesStompTelemetryMessage() {
        RealtimePublisher realtimePublisher = Mockito.mock(RealtimePublisher.class);
        MqttInboundPersistenceService persistenceService = Mockito.mock(MqttInboundPersistenceService.class);
        CommandExecutionService commandExecutionService = Mockito.mock(CommandExecutionService.class);
        MqttInboundHandler handler = new MqttInboundHandler(
                realtimePublisher,
                persistenceService,
                commandExecutionService
        );
        MqttTelemetryPayload payload = new MqttTelemetryPayload(
                "MOWER-01",
                37.5001,
                127.0001,
                82,
                "manual",
                "mowing",
                0.4,
                92,
                Instant.parse("2026-05-30T01:00:00Z"),
                null
        );
        when(persistenceService.persistTelemetry(payload)).thenReturn(true);

        handler.handleTelemetry(payload);

        ArgumentCaptor<TelemetryMessage> captor = ArgumentCaptor.forClass(TelemetryMessage.class);
        verify(realtimePublisher).publishTelemetry(captor.capture());
        assertThat(captor.getValue().robotId()).isEqualTo("MOWER-01");
        assertThat(captor.getValue().batteryLevel()).isEqualTo(82);
        assertThat(captor.getValue().lastReceivedAt()).isEqualTo(payload.receivedAt());
    }

    @Test
    void outboundManualCommandUsesQos0AndManualTopic() {
        CapturingMqttTransport transport = new CapturingMqttTransport();
        MqttCommandPublisher publisher = new MqttCommandPublisher(
                transport,
                new MqttTopicResolver(),
                objectMapper(),
                Mockito.mock(CommandExecutionService.class)
        );
        MqttCommandPayload payload = command("manual-command");

        publisher.publishManualCommand(payload);

        assertThat(transport.topic).isEqualTo("mowers/MOWER-01/commands/manual");
        assertThat(transport.qos).isEqualTo(MqttQoS.BEST_EFFORT);
        assertThat(new String(transport.payload, StandardCharsets.UTF_8)).contains("\"commandType\":\"manual-command\"");
    }

    @Test
    void outboundEmergencyStopUsesQos1AndDedicatedTopic() {
        CapturingMqttTransport transport = new CapturingMqttTransport();
        MqttCommandPublisher publisher = new MqttCommandPublisher(
                transport,
                new MqttTopicResolver(),
                objectMapper(),
                Mockito.mock(CommandExecutionService.class)
        );
        MqttCommandPayload payload = command("emergency-stop");

        publisher.publishEmergencyStop(payload);

        assertThat(transport.topic).isEqualTo("mowers/MOWER-01/commands/estop");
        assertThat(transport.qos).isEqualTo(MqttQoS.AT_LEAST_ONCE);
        assertThat(new String(transport.payload, StandardCharsets.UTF_8)).contains("\"priority\":\"emergency\"");
    }

    @Test
    void inboundCommandAckUpdatesCommandExecutionLifecycle() {
        RealtimePublisher realtimePublisher = Mockito.mock(RealtimePublisher.class);
        MqttInboundPersistenceService persistenceService = Mockito.mock(MqttInboundPersistenceService.class);
        CommandExecutionService commandExecutionService = Mockito.mock(CommandExecutionService.class);
        MqttInboundHandler handler = new MqttInboundHandler(
                realtimePublisher,
                persistenceService,
                commandExecutionService
        );
        MqttCommandAckPayload payload = new MqttCommandAckPayload(
                "cmd-001",
                "MOWER-01",
                "stop",
                "accepted",
                null,
                "edge-mock",
                Instant.parse("2026-05-30T01:00:01Z"),
                Instant.parse("2026-05-30T01:00:02Z")
        );

        handler.handleCommandAck(payload);

        verify(commandExecutionService).applyAck(payload);
    }

    private MqttCommandPayload command(String commandType) {
        return new MqttCommandPayload(
                "cmd-001",
                "MOWER-01",
                commandType,
                "idem-001",
                7L,
                Instant.parse("2026-05-30T00:59:59Z"),
                "operator",
                Instant.parse("2026-05-30T01:00:00Z"),
                commandType.equals("emergency-stop") ? "emergency" : "normal",
                Map.of("direction", "forward")
        );
    }

    private ObjectMapper objectMapper() {
        return new ObjectMapper().registerModule(new JavaTimeModule());
    }

    private static class CapturingMqttTransport implements MqttTransport {
        private String topic;
        private byte[] payload;
        private int qos;
        private boolean retained;

        @Override
        public void publish(String topic, byte[] payload, int qos, boolean retained) {
            this.topic = topic;
            this.payload = payload;
            this.qos = qos;
            this.retained = retained;
        }
    }
}
