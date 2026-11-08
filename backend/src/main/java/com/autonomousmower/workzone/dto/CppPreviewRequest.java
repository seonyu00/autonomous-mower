package com.autonomousmower.workzone.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record CppPreviewRequest(
        @NotNull @PositiveOrZero Integer expectedVersion,
        @NotNull @DecimalMin("0.2") @DecimalMax("0.65") Double cellSizeM,
        CppPreviewResponse.Point start
) {
    public CppPreviewRequest(Integer expectedVersion, Double cellSizeM) { this(expectedVersion, cellSizeM, null); }
}
