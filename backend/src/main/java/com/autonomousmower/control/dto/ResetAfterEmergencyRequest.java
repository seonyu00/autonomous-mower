package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record ResetAfterEmergencyRequest(
        @NotBlank String idempotencyKey,
        String reason
) {
}
