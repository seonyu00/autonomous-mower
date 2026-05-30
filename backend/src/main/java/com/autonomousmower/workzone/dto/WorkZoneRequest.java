package com.autonomousmower.workzone.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record WorkZoneRequest(
        @NotBlank String robotId,
        Integer expectedVersion,
        @Valid @NotNull WorkZonePayload zone
) {
}
