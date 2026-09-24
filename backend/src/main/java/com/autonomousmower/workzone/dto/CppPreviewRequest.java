package com.autonomousmower.workzone.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record CppPreviewRequest(
        @NotNull @PositiveOrZero Integer expectedVersion,
        @NotNull @DecimalMin("0.2") @DecimalMax("5.0") Double cellSizeM
) {
}
