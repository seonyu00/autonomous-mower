package com.autonomousmower.mqtt.service;

import com.autonomousmower.mqtt.dto.MqttCommandAckPayload;
import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.autonomousmower.mqtt.dto.MqttStatusPayload;
import com.autonomousmower.mqtt.dto.MqttTelemetryPayload;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttAsyncClient;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "app.mqtt", name = "enabled", havingValue = "true")
public class MqttInboundSubscriber {

    private static final Logger log = LoggerFactory.getLogger(MqttInboundSubscriber.class);
    private static final String TELEMETRY_TOPIC = "mowers/+/telemetry";
    private static final String STATUS_TOPIC = "mowers/+/status";
    private static final String EVENTS_TOPIC = "mowers/+/events";
    private static final String COMMAND_ACK_TOPIC = "mowers/+/commands/ack";

    private final MqttAsyncClient mqttAsyncClient;
    private final MqttConnectOptions mqttConnectOptions;
    private final MqttInboundHandler inboundHandler;
    private final ObjectMapper objectMapper;

    public MqttInboundSubscriber(
            MqttAsyncClient mqttAsyncClient,
            MqttConnectOptions mqttConnectOptions,
            MqttInboundHandler inboundHandler,
            ObjectMapper objectMapper
    ) {
        this.mqttAsyncClient = mqttAsyncClient;
        this.mqttConnectOptions = mqttConnectOptions;
        this.inboundHandler = inboundHandler;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void start() {
        mqttAsyncClient.setCallback(new MqttCallbackExtended() {
            @Override
            public void connectComplete(boolean reconnect, String serverURI) {
                subscribeToInboundTopics();
            }

            @Override
            public void connectionLost(Throwable cause) {
                log.warn("MQTT connection lost; automatic reconnect is enabled.", cause);
            }

            @Override
            public void messageArrived(String topic, MqttMessage message) {
                handleMessage(topic, message);
            }

            @Override
            public void deliveryComplete(IMqttDeliveryToken token) {
                // Outbound delivery logging is handled by MqttCommandPublisher.
            }
        });

        try {
            if (!mqttAsyncClient.isConnected()) {
                mqttAsyncClient.connect(mqttConnectOptions).waitForCompletion();
            }
        } catch (MqttException exception) {
            throw new IllegalStateException("Failed to connect MQTT inbound subscriber.", exception);
        }
    }

    private void subscribeToInboundTopics() {
        try {
            mqttAsyncClient.subscribe(
                    new String[] {TELEMETRY_TOPIC, STATUS_TOPIC, EVENTS_TOPIC, COMMAND_ACK_TOPIC},
                    new int[] {
                            MqttQoS.AT_LEAST_ONCE,
                            MqttQoS.AT_LEAST_ONCE,
                            MqttQoS.AT_LEAST_ONCE,
                            MqttQoS.AT_LEAST_ONCE
                    }
            ).waitForCompletion();
            log.info(
                    "Subscribed MQTT inbound topics: {}, {}, {}, {}",
                    TELEMETRY_TOPIC,
                    STATUS_TOPIC,
                    EVENTS_TOPIC,
                    COMMAND_ACK_TOPIC
            );
        } catch (MqttException exception) {
            throw new IllegalStateException("Failed to subscribe MQTT inbound topics.", exception);
        }
    }

    private void handleMessage(String topic, MqttMessage message) {
        String[] parts = topic.split("/");
        if (!isSupportedTopic(parts)) {
            log.warn("Ignoring MQTT message on unexpected topic={}", topic);
            return;
        }

        String topicRobotId = parts[1];
        String channel = parts.length == 4 ? "commands/ack" : parts[2];
        String payload = new String(message.getPayload(), StandardCharsets.UTF_8);

        try {
            switch (channel) {
                case "telemetry" -> {
                    MqttTelemetryPayload telemetry = objectMapper.readValue(payload, MqttTelemetryPayload.class);
                    if (sameRobot(topicRobotId, telemetry.robotId(), topic)) {
                        inboundHandler.handleTelemetry(telemetry);
                    }
                }
                case "status" -> {
                    MqttStatusPayload status = objectMapper.readValue(payload, MqttStatusPayload.class);
                    if (sameRobot(topicRobotId, status.robotId(), topic)) {
                        inboundHandler.handleStatus(status);
                    }
                }
                case "events" -> {
                    MqttEventPayload event = objectMapper.readValue(payload, MqttEventPayload.class);
                    if (sameRobot(topicRobotId, event.robotId(), topic)) {
                        inboundHandler.handleEvent(event);
                    }
                }
                case "commands/ack" -> {
                    MqttCommandAckPayload ack = objectMapper.readValue(payload, MqttCommandAckPayload.class);
                    if (sameRobot(topicRobotId, ack.robotId(), topic)) {
                        inboundHandler.handleCommandAck(ack);
                    }
                }
                default -> log.warn("Ignoring MQTT message on unsupported inbound channel topic={}", topic);
            }
        } catch (Exception exception) {
            log.warn("Failed to process MQTT inbound topic={} payload={}", topic, payload, exception);
        }
    }

    private boolean isSupportedTopic(String[] parts) {
        if (parts.length == 3) {
            return "mowers".equals(parts[0]);
        }
        return parts.length == 4
                && "mowers".equals(parts[0])
                && "commands".equals(parts[2])
                && "ack".equals(parts[3]);
    }

    private boolean sameRobot(String topicRobotId, String payloadRobotId, String topic) {
        if (!topicRobotId.equals(payloadRobotId)) {
            log.warn(
                    "Ignoring MQTT message with robotId mismatch topic={} topicRobotId={} payloadRobotId={}",
                    topic,
                    topicRobotId,
                    payloadRobotId
            );
            return false;
        }
        return true;
    }
}
