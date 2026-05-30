package com.autonomousmower.control.service;

import com.autonomousmower.control.model.ControlLockSnapshot;
import com.autonomousmower.realtime.dto.ControlLockMessage;

final class ControlRealtimeMapper {

    private ControlRealtimeMapper() {
    }

    static ControlLockMessage toMessage(ControlLockSnapshot snapshot) {
        return new ControlLockMessage(
                snapshot.robotId(),
                snapshot.lockState(),
                snapshot.controlOwner(),
                snapshot.controlOwnerName(),
                snapshot.mode(),
                snapshot.emergency(),
                snapshot.lockVersion(),
                snapshot.expiresAt(),
                snapshot.reason(),
                snapshot.updatedAt()
        );
    }
}
