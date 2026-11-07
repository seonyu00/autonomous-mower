package com.autonomousmower.robot.dto;

public record ControlSummaryResponse(
        String lockState,
        String controlOwner,
        String mode,
        boolean emergency
) {
    public static ControlSummaryResponse from(com.autonomousmower.control.model.ControlLockSnapshot snapshot) {
        return new ControlSummaryResponse(snapshot.lockState(), snapshot.controlOwner(), snapshot.mode(), snapshot.emergency());
    }
}
