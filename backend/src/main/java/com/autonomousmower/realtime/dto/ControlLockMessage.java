package com.autonomousmower.realtime.dto;

import java.time.Instant;

public record ControlLockMessage(
        String robotId,
        String lockState,
        String controlOwner,
        String controlOwnerName,
        String mode,
        boolean emergency,
        long lockVersion,
        Instant expiresAt,
        String reason,
        Instant updatedAt
) {
}
