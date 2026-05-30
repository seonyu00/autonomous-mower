package com.autonomousmower.robot.dto;

public record ControlSummaryResponse(
        String lockState,
        String controlOwner,
        String mode,
        boolean emergency
) {
    public static ControlSummaryResponse placeholder() {
        return new ControlSummaryResponse("none", null, "idle", false);
    }
}
