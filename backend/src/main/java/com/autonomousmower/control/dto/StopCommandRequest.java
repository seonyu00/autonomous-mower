package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record StopCommandRequest(
        @NotBlank String action,
        @NotBlank String robotId,
        @NotBlank String direction,
        double speed,
        @NotBlank String idempotencyKey,
        long lockVersion,
        String reason
) {
}
