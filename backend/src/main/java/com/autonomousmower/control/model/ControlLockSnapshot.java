package com.autonomousmower.control.model;

import java.time.Instant;

public record ControlLockSnapshot(
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
