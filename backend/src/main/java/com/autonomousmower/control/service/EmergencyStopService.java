package com.autonomousmower.control.service;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.auth.security.Permission;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.dto.EmergencyStopRequest;
import com.autonomousmower.control.dto.ResetAfterEmergencyRequest;
import com.autonomousmower.control.model.ControlLockSnapshot;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.mqtt.service.MqttCommandPublisher;
import com.autonomousmower.realtime.service.RealtimePublisher;
import java.time.Instant;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class EmergencyStopService {

    private final ControlStateStore controlStateStore;
    private final RealtimePublisher realtimePublisher;
    private final ControlResponseFactory responseFactory;
    private final ControlEventPublisher controlEventPublisher;
    private final MqttCommandPublisher mqttCommandPublisher;
    private final ControlRobotGuard controlRobotGuard;

    public EmergencyStopService(
            ControlStateStore controlStateStore,
            RealtimePublisher realtimePublisher,
            ControlResponseFactory responseFactory,
            ControlEventPublisher controlEventPublisher,
            MqttCommandPublisher mqttCommandPublisher,
            ControlRobotGuard controlRobotGuard
    ) {
        this.controlStateStore = controlStateStore;
        this.realtimePublisher = realtimePublisher;
        this.responseFactory = responseFactory;
        this.controlEventPublisher = controlEventPublisher;
        this.mqttCommandPublisher = mqttCommandPublisher;
        this.controlRobotGuard = controlRobotGuard;
    }

    public ControlCommandResponse activate(String robotId, EmergencyStopRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        Instant requestedAt = Instant.now();
        ControlLockSnapshot snapshot = controlStateStore.stateFor(robotId)
                .activateEmergency(request.reason(), requestedAt);
        ControlCommandResponse response = responseFactory.accepted("emergency-stop", snapshot, requestedAt);
        mqttCommandPublisher.publishEmergencyStop(new MqttCommandPayload(
                response.commandId(),
                robotId,
                response.commandType(),
                request.idempotencyKey(),
                null,
                null,
                user.getAdminId(),
                requestedAt,
                "emergency",
                Map.of("reason", request.reason() == null ? "operator emergency stop" : request.reason())
        ));
        realtimePublisher.publishControlLock(ControlRealtimeMapper.toMessage(snapshot));
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    public ControlCommandResponse reset(String robotId, ResetAfterEmergencyRequest request, SecurityUser user) {
        controlRobotGuard.requireKnownRobot(robotId);
        Instant requestedAt = Instant.now();
        ControlLockSnapshot snapshot = controlStateStore.stateFor(robotId)
                .resetEmergency(user.getAdminId(), hasTakeoverAuthority(user), request.reason(), requestedAt);
        realtimePublisher.publishControlLock(ControlRealtimeMapper.toMessage(snapshot));
        ControlCommandResponse response = responseFactory.accepted("reset-after-emergency", snapshot, requestedAt);
        controlEventPublisher.publishAccepted(response, user.getAdminId());
        return response;
    }

    private boolean hasTakeoverAuthority(SecurityUser user) {
        return user.getPermissionValues().contains(Permission.CONTROL_TAKEOVER.getValue());
    }
}
