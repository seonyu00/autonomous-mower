package com.autonomousmower.mqtt.service;

import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.mqtt.transport.MqttTransport;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Service;

@Service
public class MqttCommandPublisher {

    private final MqttTransport mqttTransport;
    private final MqttTopicResolver topicResolver;
    private final ObjectMapper objectMapper;

    public MqttCommandPublisher(MqttTransport mqttTransport, MqttTopicResolver topicResolver, ObjectMapper objectMapper) {
        this.mqttTransport = mqttTransport;
        this.topicResolver = topicResolver;
        this.objectMapper = objectMapper;
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

    private void publish(String topic, MqttCommandPayload payload, int qos) {
        try {
            byte[] bytes = objectMapper.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8);
            mqttTransport.publish(topic, bytes, qos, false);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Invalid MQTT command payload.", exception);
        }
    }
}
