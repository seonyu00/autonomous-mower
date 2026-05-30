package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record ReleaseControlRequest(
        @NotBlank String idempotencyKey,
        long lockVersion
) {
}
