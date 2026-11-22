package com.autonomousmower.control.dto;

import jakarta.validation.constraints.NotBlank;

public record ChangeModeRequest(
        @NotBlank String action,
        @NotBlank String robotId,
        @NotBlank String mode,
        @NotBlank String idempotencyKey,
        long lockVersion, java.util.UUID planId, Long workZoneId, Integer workZoneVersion
) {
    public ChangeModeRequest(String action, String robotId, String mode, String idempotencyKey, long lockVersion) {
        this(action,robotId,mode,idempotencyKey,lockVersion,null);
    }

    public ChangeModeRequest(String action, String robotId, String mode, String idempotencyKey,
                             long lockVersion, java.util.UUID planId) {
        this(action, robotId, mode, idempotencyKey, lockVersion, planId, null, null);
    }
}
