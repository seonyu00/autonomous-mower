package com.autonomousmower.control.service;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.dto.ChangeModeRequest;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.dto.ManualCommandRequest;
import com.autonomousmower.control.dto.ManualRearmRequest;
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
    @org.springframework.beans.factory.annotation.Autowired
    private com.autonomousmower.workzone.service.RoutePlanService routePlans;

    private static final Set<String> ALLOWED_MODES = Set.of("idle", "manual", "autonomous", "home");
    private static final Set<String> ALLOWED_ATTACHMENT_ACTIONS = Set.of("blade-start", "blade-stop", "raise", "lower");

    private final ControlStateStore controlStateStore;
    private final DeadmanService deadmanService;
    private final ControlResponseFactory responseFactory;
    private final MqttCommandPublisher mqttCommandPublisher;
    private final ControlRobotGuard controlRobotGuard;

    public ControlCommandService(
            ControlStateStore controlStateStore,
            DeadmanService deadmanService,
            ControlResponseFactory responseFactory,
            MqttCommandPublisher mqttCommandPublisher,
            ControlRobotGuard controlRobotGuard
    ) {
        this.controlStateStore = controlStateStore;
        this.deadmanService = deadmanService;
        this.responseFactory = responseFactory;
        this.mqttCommandPublisher = mqttCommandPublisher;
        this.controlRobotGuard = controlRobotGuard;
    }

    public ControlCommandResponse manual(String robotId, ManualCommandRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        // 강제 회수와 소유권 확인·발행 호출 사이에 같은 로봇의 상태 변경이 끼어들지 못하게 한다.
        synchronized (state) {
            state.requireOwner(user.getAdminId());
            state.requireNotEmergency();
            state.requireVersion(request.lockVersion());
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
                    manualParameters(request)
            ));
            return response;
        }
    }

    public ControlCommandResponse rearmManual(String robotId, ManualRearmRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        synchronized (state) {
            state.requireOwner(user.getAdminId());
            state.requireNotEmergency();
            state.requireVersion(request.lockVersion());
            ControlCommandResponse response = responseFactory.accepted("manual-rearm", state.snapshot(), requestedAt);
            mqttCommandPublisher.publishModeCommand(new MqttCommandPayload(
                    response.commandId(), robotId, response.commandType(), request.idempotencyKey(),
                    request.lockVersion(), request.clientSentAt(), user.getAdminId(), requestedAt,
                    "normal", Map.of()));
            return response;
        }
    }

    private Map<String, Object> manualParameters(ManualCommandRequest request) {
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("direction", request.direction());
        result.put("speed", request.speed());
        if (request.armId() != null) result.put("armId", request.armId());
        if (request.pressId() != null) result.put("pressId", request.pressId());
        return result;
    }

    public ControlCommandResponse changeMode(String robotId, ChangeModeRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        validateAllowed(request.mode(), ALLOWED_MODES);
        if ("autonomous".equals(request.mode())) {
            if (request.planId() == null) throw new BusinessException(ErrorCode.CPP_INPUT_INVALID);
            routePlans.get(robotId, request.planId());
            // 파일 준비 보고는 실제 위치·방향·제어 중재 확인이 아니다. 운영 어댑터 연결 전 발행을 막는다.
            throw new BusinessException(ErrorCode.AUTONOMY_READINESS_UNCONFIRMED);
        }
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        synchronized (state) {
            state.requireVersion(request.lockVersion());
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
            return response;
        }
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
        synchronized (state) {
            state.requireOwner(user.getAdminId());
            state.requireNotEmergency();
            state.requireVersion(request.lockVersion());
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
            return response;
        }
    }

    public ControlCommandResponse stop(String robotId, StopCommandRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        synchronized (state) {
            state.requireVersion(request.lockVersion());
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
                    stopParameters(request)
            ));
            return response;
        }
    }

    private void validateRobotId(String pathRobotId, String payloadRobotId) {
        if (!pathRobotId.equals(payloadRobotId)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    private Map<String, Object> stopParameters(StopCommandRequest request) {
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("reason", request.reason() == null ? "operator-stop" : request.reason());
        result.put("speed", 0);
        if (request.armId() != null) result.put("armId", request.armId());
        if (request.pressId() != null) result.put("pressId", request.pressId());
        return result;
    }

    private void validateAllowed(String value, Set<String> allowedValues) {
        if (!allowedValues.contains(value)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}
