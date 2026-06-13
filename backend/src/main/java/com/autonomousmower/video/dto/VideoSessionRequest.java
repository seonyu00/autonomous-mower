package com.autonomousmower.video.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record VideoSessionRequest(
        @NotBlank String robotId,
        @Min(1) int width,
        @Min(1) int height,
        @Min(1) int fps,
        @Min(1) @Max(500) int maxBitrateKbps
) {
}
