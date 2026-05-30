package com.autonomousmower.mqtt.service;

import org.springframework.stereotype.Component;

@Component
public class MqttTopicResolver {

    public String telemetryInbound(String robotId) {
        return robotTopic(robotId, "telemetry");
    }

    public String statusInbound(String robotId) {
        return robotTopic(robotId, "status");
    }

    public String eventInbound(String robotId) {
        return robotTopic(robotId, "events");
    }

    public String commandAckInbound(String robotId) {
        return robotCommandTopic(robotId, "ack");
    }

    public String manualCommandOutbound(String robotId) {
        return robotCommandTopic(robotId, "manual");
    }

    public String stopCommandOutbound(String robotId) {
        return robotCommandTopic(robotId, "stop");
    }

    public String emergencyStopCommandOutbound(String robotId) {
        return robotCommandTopic(robotId, "estop");
    }

    public String modeCommandOutbound(String robotId) {
        return robotCommandTopic(robotId, "mode");
    }

    public String attachmentCommandOutbound(String robotId) {
        return robotCommandTopic(robotId, "attachment");
    }

    private String robotTopic(String robotId, String topicName) {
        return "mowers/" + robotId + "/" + topicName;
    }

    private String robotCommandTopic(String robotId, String commandName) {
        return "mowers/" + robotId + "/commands/" + commandName;
    }
}
