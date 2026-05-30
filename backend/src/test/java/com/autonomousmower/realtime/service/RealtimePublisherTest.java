package com.autonomousmower.realtime.service;

import static org.mockito.Mockito.verify;

import com.autonomousmower.realtime.dto.ControlLockMessage;
import com.autonomousmower.realtime.dto.ControlEventMessage;
import com.autonomousmower.realtime.dto.RobotEventMessage;
import com.autonomousmower.realtime.dto.RobotStatusMessage;
import com.autonomousmower.realtime.dto.TelemetryMessage;
import com.autonomousmower.realtime.dto.VideoStatusMessage;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

@ExtendWith(MockitoExtension.class)
class RealtimePublisherTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Test
    void publishesTelemetryToContractTopic() {
        RealtimePublisher publisher = new RealtimePublisher(messagingTemplate);
        TelemetryMessage message = new TelemetryMessage(
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

        publisher.publishTelemetry(message);

        verify(messagingTemplate).convertAndSend("/topic/robots/MOWER-01/telemetry", message);
    }

    @Test
    void publishesAllPhase5TopicTypes() {
        RealtimePublisher publisher = new RealtimePublisher(messagingTemplate);
        Instant now = Instant.parse("2026-05-30T01:00:00Z");
        RobotStatusMessage status = new RobotStatusMessage(
                "MOWER-01", "online", "connected", "connected", "connected", now, false
        );
        RobotEventMessage event = new RobotEventMessage(
                "event-001", "MOWER-01", "warning", "obstacle-detected", "Obstacle detected.", now, "edge", null, null
        );
        ControlLockMessage controlLock = new ControlLockMessage(
                "MOWER-01", "held", "admin", "ADMIN USER", "manual", false, 7, now, "claim-control", now
        );
        ControlEventMessage controlEvent = new ControlEventMessage(
                "MOWER-01", "cmd-001", "manual-command", "accepted", null, "admin", now, null
        );
        VideoStatusMessage videoStatus = new VideoStatusMessage(
                "MOWER-01", "video-session-001", "connected", 15, 640, 480, 480, "H264", null, now
        );

        publisher.publishStatus(status);
        publisher.publishEvent(event);
        publisher.publishControlLock(controlLock);
        publisher.publishControlEvent(controlEvent);
        publisher.publishVideoStatus(videoStatus);

        verify(messagingTemplate).convertAndSend("/topic/robots/MOWER-01/status", status);
        verify(messagingTemplate).convertAndSend("/topic/robots/MOWER-01/events", event);
        verify(messagingTemplate).convertAndSend("/topic/robots/MOWER-01/control-lock", controlLock);
        verify(messagingTemplate).convertAndSend("/topic/robots/MOWER-01/control-events", controlEvent);
        verify(messagingTemplate).convertAndSend("/topic/robots/MOWER-01/video-status", videoStatus);
    }
}
