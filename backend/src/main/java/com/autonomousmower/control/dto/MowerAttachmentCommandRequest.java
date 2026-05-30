package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record MowerAttachmentCommandRequest(
        @NotBlank String action,
        @NotBlank String robotId,
        @NotBlank String attachmentAction,
        @NotBlank String idempotencyKey,
        long lockVersion
) {
}
