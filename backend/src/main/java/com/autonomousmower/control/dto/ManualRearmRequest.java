package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record ManualRearmRequest(
        @NotBlank String robotId,
        @NotBlank String idempotencyKey,
        long lockVersion,
        @NotNull Instant clientSentAt,
        String challenge
) {
    public ManualRearmRequest(String robotId, String idempotencyKey, long lockVersion, Instant clientSentAt) {
        this(robotId, idempotencyKey, lockVersion, clientSentAt, null);
    }
}
