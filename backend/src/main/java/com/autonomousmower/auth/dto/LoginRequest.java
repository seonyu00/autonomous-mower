package com.autonomousmower.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank String adminId,
        @NotBlank String password
) {
}
