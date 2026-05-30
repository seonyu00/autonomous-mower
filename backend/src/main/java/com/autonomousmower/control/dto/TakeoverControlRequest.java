package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record TakeoverControlRequest(
        @NotBlank String idempotencyKey,
        String reason
) {
}
