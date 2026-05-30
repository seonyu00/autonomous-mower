package com.autonomousmower.control.service;

import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.model.ControlLockSnapshot;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class ControlResponseFactory {

    public ControlCommandResponse accepted(String commandType, ControlLockSnapshot snapshot, Instant requestedAt) {
        Instant acceptedAt = Instant.now();
        return new ControlCommandResponse(
                true,
                snapshot.robotId(),
                "cmd-" + UUID.randomUUID(),
                commandType,
                requestedAt,
                acceptedAt,
                snapshot.lockState(),
                snapshot.controlOwner(),
                snapshot.mode(),
                snapshot.emergency()
        );
    }
}
