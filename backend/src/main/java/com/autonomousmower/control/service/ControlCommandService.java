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
    @org.springframework.beans.factory.annotation.Autowired
    private com.autonomousmower.workzone.service.WorkZoneService workZones;

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
            deadmanService.recordCommand(robotId, requestedAt, request.armId(), request.pressId());
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
        return publishManualSetup(robotId, request, user, "manual-rearm");
    }

    public ControlCommandResponse prepareManual(String robotId, ManualRearmRequest request, SecurityUser user) {
        if (request.challenge() == null || request.challenge().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return publishManualSetup(robotId, request, user, "manual-prepare");
    }

    private ControlCommandResponse publishManualSetup(String robotId, ManualRearmRequest request,
            SecurityUser user, String commandType) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        synchronized (state) {
            state.requireOwner(user.getAdminId());
            state.requireNotEmergency();
            state.requireVersion(request.lockVersion());
            ControlCommandResponse response = responseFactory.accepted(commandType, state.snapshot(), requestedAt);
            mqttCommandPublisher.publishModeCommand(new MqttCommandPayload(
                    response.commandId(), robotId, response.commandType(), request.idempotencyKey(),
                    request.lockVersion(), request.clientSentAt(), user.getAdminId(), requestedAt,
                    "normal", request.challenge() == null ? Map.of() : Map.of("challenge", request.challenge())));
            return response;
        }
    }

    private Map<String, Object> manualParameters(ManualCommandRequest request) {
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("direction", request.direction());
        result.put("speed", request.speed());
        if (request.armId() != null) result.put("armId", request.armId());
        if (request.pressId() != null) result.put("pressId", request.pressId());
        if (request.challenge() != null) result.put("challenge", request.challenge());
        return result;
    }

    public ControlCommandResponse changeMode(String robotId, ChangeModeRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        validateRobotId(robotId, request.robotId());
        validateAllowed(request.mode(), ALLOWED_MODES);
        Instant requestedAt = Instant.now();
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        synchronized (state) {
            if ("autonomous".equals(request.mode())) {
                state.requireOwner(user.getAdminId());
                state.requireNotEmergency();
                state.requireVersion(request.lockVersion());
                if (state.hasActiveAutonomy(requestedAt)) {
                    throw new BusinessException(ErrorCode.AUTONOMY_ALREADY_ACTIVE);
                }
                if (request.workZoneId() == null && request.workZoneVersion() == null && request.planId() != null) {
                    // 배포 전 구형 웹에서 보낸 계획 ID도 현재 구역과 대조한다.
                    routePlans.get(robotId, request.planId());
                } else {
                    if (request.workZoneId() == null || request.workZoneId() <= 0
                            || request.workZoneVersion() == null || request.workZoneVersion() <= 0) {
                        throw new BusinessException(ErrorCode.INVALID_REQUEST);
                    }
                    var zone = workZones.getWorkZone(robotId);
                    if (!request.workZoneId().equals(zone.zoneId()) || request.workZoneVersion() != zone.version()) {
                        throw new BusinessException(ErrorCode.WORK_ZONE_CONFLICT);
                    }
                }
                // r61 SSH 감독 실행기는 입력을 받은 뒤에 준비 상태를 만들며, 첫 r 프레임 전에는
                // 출력이 허용되지 않는다. 따라서 여기서는 안전한 감독 시작 요청만 전송하고,
                // 실제 출발 판정은 Jetson의 최신 입력 게이트가 맡는다.
                ControlLockSnapshot snapshot = state.changeMode(user.getAdminId(), request.mode(), requestedAt);
                ControlCommandResponse response = responseFactory.accepted("change-mode", snapshot, requestedAt);
                Map<String, Object> parameters = new java.util.HashMap<>();
                parameters.put("mode", request.mode());
                parameters.put("workZoneId", request.workZoneId());
                parameters.put("workZoneVersion", request.workZoneVersion());
                mqttCommandPublisher.publishModeCommand(new MqttCommandPayload(
                        response.commandId(), robotId, response.commandType(), request.idempotencyKey(),
                        snapshot.lockVersion(), null, user.getAdminId(), requestedAt, "normal", parameters));
                state.recordAutonomyCommand(response.commandId(), Instant.now());
                return response;
            }
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

    public long autonomyAuthorityMillis(String robotId, String commandId, long version) {
        controlRobotGuard.requireKnownRobot(robotId);
        var state = controlStateStore.stateFor(robotId);
        synchronized (state) {
            return state.autonomyAuthorityMillis(commandId, version, Instant.now());
        }
    }

    public void renewAutonomyBrowser(String robotId, String commandId, long version, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        var state = controlStateStore.stateFor(robotId);
        synchronized (state) {
            if (!state.renewAutonomyBrowser(commandId, version, user.getAdminId(), Instant.now())) {
                throw new BusinessException(ErrorCode.CONTROL_VERSION_CONFLICT);
            }
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
            ControlLockSnapshot snapshot = state.snapshot();
            ControlCommandResponse response = responseFactory.accepted("stop", snapshot, requestedAt);
            state.recordAutonomyCommand(null, requestedAt);
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
            // 정지 발행에 실패하면 기존 이동 입력의 데드맨 감시를 유지한다.
            state.recordStop(request.armId(), request.pressId());
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
