package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record ClaimControlRequest(
        @NotBlank String idempotencyKey,
        @NotBlank String requestedMode
) {
}
