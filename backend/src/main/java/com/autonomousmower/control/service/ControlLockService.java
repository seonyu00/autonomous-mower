package com.autonomousmower.control.service;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.control.dto.ClaimControlRequest;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.dto.ReleaseControlRequest;
import com.autonomousmower.control.dto.TakeoverControlRequest;
import com.autonomousmower.control.model.ControlLockSnapshot;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.realtime.service.RealtimePublisher;
import java.time.Instant;
import org.springframework.stereotype.Service;

@Service
public class ControlLockService {

    private final ControlStateStore controlStateStore;
    private final RealtimePublisher realtimePublisher;
    private final ControlResponseFactory responseFactory;
    private final ControlEventPublisher controlEventPublisher;
    private final ControlRobotGuard controlRobotGuard;

    public ControlLockService(
            ControlStateStore controlStateStore,
            RealtimePublisher realtimePublisher,
            ControlResponseFactory responseFactory,
            ControlEventPublisher controlEventPublisher,
            ControlRobotGuard controlRobotGuard
    ) {
        this.controlStateStore = controlStateStore;
        this.realtimePublisher = realtimePublisher;
        this.responseFactory = responseFactory;
        this.controlEventPublisher = controlEventPublisher;
        this.controlRobotGuard = controlRobotGuard;
    }

    public ControlCommandResponse claim(String robotId, ClaimControlRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        Instant requestedAt = Instant.now();
        ControlLockSnapshot snapshot = controlStateStore.stateFor(robotId)
                .claim(user.getAdminId(), user.getDisplayName(), request.requestedMode(), requestedAt);
        publishLock(snapshot);
        ControlCommandResponse response = responseFactory.accepted("claim-control", snapshot, requestedAt);
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    public ControlCommandResponse release(String robotId, ReleaseControlRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        Instant requestedAt = Instant.now();
        ControlLockSnapshot snapshot = controlStateStore.stateFor(robotId)
                .release(user.getAdminId(), requestedAt);
        publishLock(snapshot);
        ControlCommandResponse response = responseFactory.accepted("release-control", snapshot, requestedAt);
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    public ControlCommandResponse takeover(String robotId, TakeoverControlRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        Instant requestedAt = Instant.now();
        ControlLockSnapshot snapshot = controlStateStore.stateFor(robotId)
                .takeover(user.getAdminId(), user.getDisplayName(), request.reason(), requestedAt);
        publishLock(snapshot);
        ControlCommandResponse response = responseFactory.accepted("takeover-control", snapshot, requestedAt);
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    public ControlLockSnapshot snapshot(String robotId) {
        controlRobotGuard.requireKnownRobot(robotId);
        return controlStateStore.stateFor(robotId).snapshot();
    }

    void publishLock(ControlLockSnapshot snapshot) {
        realtimePublisher.publishControlLock(ControlRealtimeMapper.toMessage(snapshot));
    }
}
