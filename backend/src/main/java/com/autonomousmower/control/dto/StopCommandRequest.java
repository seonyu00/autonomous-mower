package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record StopCommandRequest(
        @NotBlank String action,
        @NotBlank String robotId,
        @NotBlank String direction,
        double speed,
        @NotBlank String idempotencyKey,
        long lockVersion,
        String reason,
        String armId,
        String pressId
) {
    public StopCommandRequest(String action, String robotId, String direction, double speed,
            String idempotencyKey, long lockVersion, String reason) {
        this(action, robotId, direction, speed, idempotencyKey, lockVersion, reason, null, null);
    }
}
