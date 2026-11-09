package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record ManualRearmRequest(
        @NotBlank String robotId,
        @NotBlank String idempotencyKey,
        long lockVersion,
        @NotNull Instant clientSentAt
) {}
