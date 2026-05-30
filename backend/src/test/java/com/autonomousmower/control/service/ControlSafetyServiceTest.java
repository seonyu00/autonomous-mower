package com.autonomousmower.control.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.verify;

import com.autonomousmower.auth.security.RoleName;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.dto.ClaimControlRequest;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.dto.EmergencyStopRequest;
import com.autonomousmower.control.dto.ManualCommandRequest;
import com.autonomousmower.control.dto.ReleaseControlRequest;
import com.autonomousmower.control.dto.ResetAfterEmergencyRequest;
import com.autonomousmower.control.dto.TakeoverControlRequest;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.service.MqttCommandPublisher;
import com.autonomousmower.realtime.dto.ControlEventMessage;
import com.autonomousmower.realtime.dto.ControlLockMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ControlSafetyServiceTest {

    @Mock
    private RealtimePublisher realtimePublisher;

    @Mock
    private MqttCommandPublisher mqttCommandPublisher;

    @Mock
    private ControlRobotGuard controlRobotGuard;

    private ControlStateStore stateStore;
    private ControlLockService controlLockService;
    private EmergencyStopService emergencyStopService;
    private ControlCommandService controlCommandService;
    private DeadmanService deadmanService;

    private final SecurityUser operator = SecurityUser.from("operator", "Operator", RoleName.OPERATOR);
    private final SecurityUser otherOperator = SecurityUser.from("other", "Other Operator", RoleName.OPERATOR);
    private final SecurityUser supervisor = SecurityUser.from("supervisor", "Supervisor", RoleName.SUPERVISOR);

    @BeforeEach
    void setUp() {
        stateStore = new ControlStateStore();
        ControlResponseFactory responseFactory = new ControlResponseFactory();
        ControlEventPublisher controlEventPublisher = new ControlEventPublisher(realtimePublisher);
        deadmanService = new DeadmanService(stateStore, controlEventPublisher, mqttCommandPublisher);
        controlLockService = new ControlLockService(
                stateStore,
                realtimePublisher,
                responseFactory,
                controlEventPublisher,
                controlRobotGuard
        );
        emergencyStopService = new EmergencyStopService(
                stateStore,
                realtimePublisher,
                responseFactory,
                controlEventPublisher,
                mqttCommandPublisher,
                controlRobotGuard
        );
        controlCommandService = new ControlCommandService(
                stateStore,
                deadmanService,
                responseFactory,
                controlEventPublisher,
                mqttCommandPublisher,
                controlRobotGuard
        );
    }

    @Test
    void claimReleaseAndTakeoverPublishControlLockState() {
        ControlCommandResponse claim = controlLockService.claim(
                "MOWER-01",
                new ClaimControlRequest("claim-key", "manual"),
                operator
        );

        assertThat(claim.accepted()).isTrue();
        assertThat(claim.lockState()).isEqualTo("held");
        assertThat(claim.controlOwner()).isEqualTo("operator");

        assertThatThrownBy(() -> controlLockService.claim(
                "MOWER-01",
                new ClaimControlRequest("other-key", "manual"),
                supervisor
        ))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONTROL_OWNED_BY_OTHER_USER);

        ControlCommandResponse takeover = controlLockService.takeover(
                "MOWER-01",
                new TakeoverControlRequest("takeover-key", "supervisor takeover"),
                supervisor
        );
        assertThat(takeover.controlOwner()).isEqualTo("supervisor");

        ControlCommandResponse release = controlLockService.release(
                "MOWER-01",
                new ReleaseControlRequest("release-key", 0),
                supervisor
        );
        assertThat(release.lockState()).isEqualTo("none");

        verify(realtimePublisher, atLeast(3)).publishControlLock(any(ControlLockMessage.class));
        verify(realtimePublisher, atLeast(3)).publishControlEvent(any(ControlEventMessage.class));
    }

    @Test
    void emergencyBlocksNormalManualCommandUntilReset() {
        controlLockService.claim("MOWER-01", new ClaimControlRequest("claim-key", "manual"), operator);
        ControlCommandResponse emergency = emergencyStopService.activate(
                "MOWER-01",
                new EmergencyStopRequest("estop-key", "operator emergency stop"),
                operator
        );

        assertThat(emergency.emergency()).isTrue();
        assertThat(emergency.mode()).isEqualTo("emergency");

        ManualCommandRequest manual = new ManualCommandRequest(
                "manual",
                "MOWER-01",
                "forward",
                0.5,
                "manual-key",
                0,
                Instant.now()
        );
        assertThatThrownBy(() -> controlCommandService.manual("MOWER-01", manual, operator))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ROBOT_IN_EMERGENCY);

        ControlCommandResponse reset = emergencyStopService.reset(
                "MOWER-01",
                new ResetAfterEmergencyRequest("reset-key", "safe state verified"),
                operator
        );
        assertThat(reset.emergency()).isFalse();
        assertThat(reset.mode()).isEqualTo("idle");
    }

    @Test
    void emergencyResetRequiresOwnerOrTakeoverWhenOwnerExists() {
        controlLockService.claim("MOWER-01", new ClaimControlRequest("claim-key", "manual"), operator);
        emergencyStopService.activate(
                "MOWER-01",
                new EmergencyStopRequest("estop-key", "operator emergency stop"),
                operator
        );

        assertThatThrownBy(() -> emergencyStopService.reset(
                "MOWER-01",
                new ResetAfterEmergencyRequest("reset-key", "safe state verified"),
                otherOperator
        ))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONTROL_OWNED_BY_OTHER_USER);

        ControlCommandResponse reset = emergencyStopService.reset(
                "MOWER-01",
                new ResetAfterEmergencyRequest("supervisor-reset-key", "supervisor verified safe state"),
                supervisor
        );
        assertThat(reset.emergency()).isFalse();
    }

    @Test
    void deadmanTimeoutPublishesSyntheticStopEvent() {
        Instant commandAt = Instant.parse("2026-05-30T01:00:00Z");
        deadmanService.recordCommand("MOWER-01", commandAt);

        boolean issued = deadmanService.evaluateTimeout(
                "MOWER-01",
                commandAt.plusMillis(501),
                Duration.ofMillis(500)
        );

        assertThat(issued).isTrue();
        verify(mqttCommandPublisher).publishStopCommand(any());
        verify(realtimePublisher).publishControlEvent(any(ControlEventMessage.class));
    }
}
