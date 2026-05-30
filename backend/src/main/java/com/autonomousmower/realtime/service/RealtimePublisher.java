package com.autonomousmower.realtime.service;

import com.autonomousmower.realtime.dto.ControlLockMessage;
import com.autonomousmower.realtime.dto.ControlEventMessage;
import com.autonomousmower.realtime.dto.RobotEventMessage;
import com.autonomousmower.realtime.dto.RobotStatusMessage;
import com.autonomousmower.realtime.dto.TelemetryMessage;
import com.autonomousmower.realtime.dto.VideoStatusMessage;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class RealtimePublisher {

    private final SimpMessagingTemplate messagingTemplate;

    public RealtimePublisher(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void publishTelemetry(TelemetryMessage message) {
        messagingTemplate.convertAndSend(RealtimeTopics.telemetry(message.robotId()), message);
    }

    public void publishStatus(RobotStatusMessage message) {
        messagingTemplate.convertAndSend(RealtimeTopics.status(message.robotId()), message);
    }

    public void publishEvent(RobotEventMessage message) {
        messagingTemplate.convertAndSend(RealtimeTopics.events(message.robotId()), message);
    }

    public void publishControlLock(ControlLockMessage message) {
        messagingTemplate.convertAndSend(RealtimeTopics.controlLock(message.robotId()), message);
    }

    public void publishControlEvent(ControlEventMessage message) {
        messagingTemplate.convertAndSend(RealtimeTopics.controlEvents(message.robotId()), message);
    }

    public void publishVideoStatus(VideoStatusMessage message) {
        messagingTemplate.convertAndSend(RealtimeTopics.videoStatus(message.robotId()), message);
    }
}
