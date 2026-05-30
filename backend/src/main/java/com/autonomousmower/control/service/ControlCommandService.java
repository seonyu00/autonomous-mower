package com.autonomousmower.control.service;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.dto.ManualCommandRequest;
import com.autonomousmower.control.dto.StopCommandRequest;
import com.autonomousmower.control.model.ControlLockSnapshot;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.mqtt.service.MqttCommandPublisher;
import java.time.Instant;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ControlCommandService {

    private final ControlStateStore controlStateStore;
    private final DeadmanService deadmanService;
    private final ControlResponseFactory responseFactory;
    private final ControlEventPublisher controlEventPublisher;
    private final MqttCommandPublisher mqttCommandPublisher;

    public ControlCommandService(
            ControlStateStore controlStateStore,
            DeadmanService deadmanService,
            ControlResponseFactory responseFactory,
            ControlEventPublisher controlEventPublisher,
            MqttCommandPublisher mqttCommandPublisher
    ) {
        this.controlStateStore = controlStateStore;
        this.deadmanService = deadmanService;
        this.responseFactory = responseFactory;
        this.controlEventPublisher = controlEventPublisher;
        this.mqttCommandPublisher = mqttCommandPublisher;
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
        mqttCommandPublisher.publishManualCommand(new MqttCommandPayload(
                response.commandId(),
                robotId,
                response.commandType(),
                user.getAdminId(),
                requestedAt,
                "normal",
                Map.of("direction", request.direction(), "speed", request.speed())
        ));
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
        mqttCommandPublisher.publishStopCommand(new MqttCommandPayload(
                response.commandId(),
                robotId,
                response.commandType(),
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
}
