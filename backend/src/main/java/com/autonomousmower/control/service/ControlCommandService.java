package com.autonomousmower.control.service;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.dto.ManualCommandRequest;
import com.autonomousmower.control.dto.StopCommandRequest;
import com.autonomousmower.control.model.ControlLockSnapshot;
import com.autonomousmower.control.model.ControlStateStore;
import java.time.Instant;
import org.springframework.stereotype.Service;

@Service
public class ControlCommandService {

    private final ControlStateStore controlStateStore;
    private final DeadmanService deadmanService;
    private final ControlResponseFactory responseFactory;
    private final ControlEventPublisher controlEventPublisher;

    public ControlCommandService(
            ControlStateStore controlStateStore,
            DeadmanService deadmanService,
            ControlResponseFactory responseFactory,
            ControlEventPublisher controlEventPublisher
    ) {
        this.controlStateStore = controlStateStore;
        this.deadmanService = deadmanService;
        this.responseFactory = responseFactory;
        this.controlEventPublisher = controlEventPublisher;
    }

    public ControlCommandResponse manual(String robotId, ManualCommandRequest request, SecurityUser user) {
        validateRobotId(robotId, request.robotId());
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        state.requireOwner(user.getAdminId());
        state.requireNotEmergency();
        deadmanService.recordCommand(robotId, requestedAt);
        ControlLockSnapshot snapshot = state.snapshot();
        ControlCommandResponse response = responseFactory.accepted("manual-command", snapshot, requestedAt);
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    public ControlCommandResponse stop(String robotId, StopCommandRequest request, SecurityUser user) {
        validateRobotId(robotId, request.robotId());
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        state.requireOwner(user.getAdminId());
        deadmanService.recordCommand(robotId, requestedAt);
        ControlLockSnapshot snapshot = state.snapshot();
        ControlCommandResponse response = responseFactory.accepted("stop", snapshot, requestedAt);
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    private void validateRobotId(String pathRobotId, String payloadRobotId) {
        if (!pathRobotId.equals(payloadRobotId)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}
