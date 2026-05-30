package com.autonomousmower.control.dto;

import java.time.Instant;

public record ControlCommandResponse(
        boolean accepted,
        String robotId,
        String commandId,
        String commandType,
        Instant requestedAt,
        Instant acceptedAt,
        String lockState,
        String controlOwner,
        String mode,
        boolean emergency
) {
}
