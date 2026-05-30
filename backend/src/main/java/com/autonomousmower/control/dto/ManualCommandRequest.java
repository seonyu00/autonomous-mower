package com.autonomousmower.control.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;

public record ManualCommandRequest(
        @NotBlank String action,
        @NotBlank String robotId,
        @NotBlank String direction,
        @DecimalMin("0.0") @DecimalMax("1.0") double speed,
        @NotBlank String idempotencyKey,
        long lockVersion,
        Instant clientSentAt
) {
}
