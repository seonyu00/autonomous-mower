package com.autonomousmower.mqtt.service;

import com.autonomousmower.control.service.CommandExecutionService;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.mqtt.transport.MqttTransport;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class MqttCommandPublisher {

    private static final Logger log = LoggerFactory.getLogger(MqttCommandPublisher.class);

    private final MqttTransport mqttTransport;
    private final MqttTopicResolver topicResolver;
    private final ObjectMapper objectMapper;
    private final CommandExecutionService commandExecutionService;

    public MqttCommandPublisher(
            MqttTransport mqttTransport,
            MqttTopicResolver topicResolver,
            ObjectMapper objectMapper,
            CommandExecutionService commandExecutionService
    ) {
        this.mqttTransport = mqttTransport;
        this.topicResolver = topicResolver;
        this.objectMapper = objectMapper;
        this.commandExecutionService = commandExecutionService;
    }

    public void publishManualCommand(MqttCommandPayload payload) {
        publish(topicResolver.manualCommandOutbound(payload.robotId()), payload, MqttQoS.BEST_EFFORT);
    }

    public void publishStopCommand(MqttCommandPayload payload) {
        publish(topicResolver.stopCommandOutbound(payload.robotId()), payload, MqttQoS.AT_LEAST_ONCE);
    }

    public void publishEmergencyStop(MqttCommandPayload payload) {
        publish(topicResolver.emergencyStopCommandOutbound(payload.robotId()), payload, MqttQoS.AT_LEAST_ONCE);
    }

    public void publishModeCommand(MqttCommandPayload payload) {
        publish(topicResolver.modeCommandOutbound(payload.robotId()), payload, MqttQoS.AT_LEAST_ONCE);
    }

    public void publishAttachmentCommand(MqttCommandPayload payload) {
        publish(topicResolver.attachmentCommandOutbound(payload.robotId()), payload, MqttQoS.AT_LEAST_ONCE);
    }

    private void publish(String topic, MqttCommandPayload payload, int qos) {
        try {
            byte[] bytes = objectMapper.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8);
            log.info(
                    "Publishing MQTT command topic={} qos={} robotId={} commandId={} commandType={}",
                    topic,
                    qos,
                    payload.robotId(),
                    payload.commandId(),
                    payload.commandType()
            );
            mqttTransport.publish(topic, bytes, qos, false);
            commandExecutionService.markSent(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Invalid MQTT command payload.", exception);
        }
    }
}
