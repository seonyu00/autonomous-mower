package com.autonomousmower.control.service;

import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.realtime.dto.ControlEventMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import org.springframework.stereotype.Component;

@Component
public class ControlEventPublisher {

    private final RealtimePublisher realtimePublisher;

    public ControlEventPublisher(RealtimePublisher realtimePublisher) {
        this.realtimePublisher = realtimePublisher;
    }

    public void publishAccepted(ControlCommandResponse response, String requestedBy) {
        realtimePublisher.publishControlEvent(new ControlEventMessage(
                response.robotId(),
                response.commandId(),
                response.commandType(),
                "accepted",
                null,
                requestedBy,
                response.acceptedAt(),
                null
        ));
    }

    public void publishSyntheticStop(String robotId, String reason) {
        realtimePublisher.publishControlEvent(new ControlEventMessage(
                robotId,
                "cmd-" + java.util.UUID.randomUUID(),
                "stop",
                "accepted",
                reason,
                "server",
                java.time.Instant.now(),
                null
        ));
    }
}
