package com.autonomousmower.workzone.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record RoutePreparationRequest(@NotNull @Pattern(regexp = "[0-9a-f]{64}") String sha256) {}
