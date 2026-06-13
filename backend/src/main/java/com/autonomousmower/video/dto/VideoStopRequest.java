package com.autonomousmower.video.dto;

import jakarta.validation.constraints.NotBlank;

public record VideoStopRequest(
        @NotBlank String robotId,
        @NotBlank String sessionId
) {
}
