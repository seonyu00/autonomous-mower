package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record EmergencyStopRequest(
        @NotBlank String idempotencyKey,
        String reason
) {
}
