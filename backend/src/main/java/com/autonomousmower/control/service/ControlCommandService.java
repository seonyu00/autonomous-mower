package com.autonomousmower.control.service;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.dto.ChangeModeRequest;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.dto.ManualCommandRequest;
import com.autonomousmower.control.dto.MowerAttachmentCommandRequest;
import com.autonomousmower.control.dto.StopCommandRequest;
import com.autonomousmower.control.model.ControlLockSnapshot;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.mqtt.service.MqttCommandPublisher;
import java.time.Instant;
import java.util.Set;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ControlCommandService {

    private static final Set<String> ALLOWED_MODES = Set.of("idle", "manual", "autonomous", "home");
    private static final Set<String> ALLOWED_ATTACHMENT_ACTIONS = Set.of("blade-start", "blade-stop", "raise", "lower");

    private final ControlStateStore controlStateStore;
    private final DeadmanService deadmanService;
    private final ControlResponseFactory responseFactory;
    private final ControlEventPublisher controlEventPublisher;
    private final MqttCommandPublisher mqttCommandPublisher;
    private final ControlRobotGuard controlRobotGuard;

    public ControlCommandService(
            ControlStateStore controlStateStore,
            DeadmanService deadmanService,
            ControlResponseFactory responseFactory,
            ControlEventPublisher controlEventPublisher,
            MqttCommandPublisher mqttCommandPublisher,
            ControlRobotGuard controlRobotGuard
    ) {
        this.controlStateStore = controlStateStore;
        this.deadmanService = deadmanService;
        this.responseFactory = responseFactory;
        this.controlEventPublisher = controlEventPublisher;
        this.mqttCommandPublisher = mqttCommandPublisher;
        this.controlRobotGuard = controlRobotGuard;
    }

    public ControlCommandResponse manual(String robotId, ManualCommandRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        state.requireOwner(user.getAdminId());
        state.requireNotEmergency();
        deadmanService.recordCommand(robotId, requestedAt);
        ControlLockSnapshot snapshot = state.snapshot();
        ControlCommandResponse response = responseFactory.accepted("manual-command", snapshot, requestedAt);
        mqttCommandPublisher.publishManualCommand(new MqttCommandPayload(
                response.commandId(),
                robotId,
                response.commandType(),
                request.idempotencyKey(),
                request.lockVersion(),
                request.clientSentAt(),
                user.getAdminId(),
                requestedAt,
                "normal",
                Map.of("direction", request.direction(), "speed", request.speed())
        ));
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    public ControlCommandResponse changeMode(String robotId, ChangeModeRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        validateAllowed(request.mode(), ALLOWED_MODES);
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        ControlLockSnapshot snapshot = state.changeMode(user.getAdminId(), request.mode(), requestedAt);
        ControlCommandResponse response = responseFactory.accepted("change-mode", snapshot, requestedAt);
        mqttCommandPublisher.publishModeCommand(new MqttCommandPayload(
                response.commandId(),
                robotId,
                response.commandType(),
                request.idempotencyKey(),
                request.lockVersion(),
                null,
                user.getAdminId(),
                requestedAt,
                "normal",
                Map.of("mode", request.mode())
        ));
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    public ControlCommandResponse attachment(
            String robotId,
            MowerAttachmentCommandRequest request,
            SecurityUser user
    ) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        validateAllowed(request.attachmentAction(), ALLOWED_ATTACHMENT_ACTIONS);
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        state.requireOwner(user.getAdminId());
        state.requireNotEmergency();
        ControlLockSnapshot snapshot = state.snapshot();
        ControlCommandResponse response = responseFactory.accepted("mower-attachment", snapshot, requestedAt);
        mqttCommandPublisher.publishAttachmentCommand(new MqttCommandPayload(
                response.commandId(),
                robotId,
                response.commandType(),
                request.idempotencyKey(),
                request.lockVersion(),
                null,
                user.getAdminId(),
                requestedAt,
                "normal",
                Map.of("attachmentAction", request.attachmentAction())
        ));
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    public ControlCommandResponse stop(String robotId, StopCommandRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        state.requireOwner(user.getAdminId());
        deadmanService.recordCommand(robotId, requestedAt);
        ControlLockSnapshot snapshot = state.snapshot();
        ControlCommandResponse response = responseFactory.accepted("stop", snapshot, requestedAt);
        mqttCommandPublisher.publishStopCommand(new MqttCommandPayload(
                response.commandId(),
                robotId,
                response.commandType(),
                request.idempotencyKey(),
                request.lockVersion(),
                null,
                user.getAdminId(),
                requestedAt,
                "stop",
                Map.of("reason", request.reason() == null ? "operator-stop" : request.reason(), "speed", 0)
        ));
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    private void validateRobotId(String pathRobotId, String payloadRobotId) {
        if (!pathRobotId.equals(payloadRobotId)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    private void validateAllowed(String value, Set<String> allowedValues) {
        if (!allowedValues.contains(value)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}
