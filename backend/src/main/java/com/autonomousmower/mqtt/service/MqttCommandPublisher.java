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
        // 별도 트랜잭션의 등록이 완료된 뒤에만 전송해 즉시 도착한 ACK도 조회할 수 있게 한다.
        commandExecutionService.register(payload);
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
        } catch (JsonProcessingException exception) {
            commandExecutionService.markPublishFailed(payload.commandId());
            throw new IllegalArgumentException("Invalid MQTT command payload.", exception);
        } catch (RuntimeException exception) {
            commandExecutionService.markPublishFailed(payload.commandId());
            throw exception;
        }
        commandExecutionService.markSent(payload.commandId());
    }
}
