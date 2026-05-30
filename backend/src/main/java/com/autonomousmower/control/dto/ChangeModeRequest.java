package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record ChangeModeRequest(
        @NotBlank String action,
        @NotBlank String robotId,
        @NotBlank String mode,
        @NotBlank String idempotencyKey,
        long lockVersion
) {
}
