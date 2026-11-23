package com.autonomousmower.control.service;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.dto.ChangeModeRequest;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.service.MqttCommandPublisher;
import com.autonomousmower.workzone.service.RoutePlanService;
import com.autonomousmower.workzone.service.WorkZoneService;
import com.autonomousmower.workzone.dto.WorkZoneResponse;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AutonomyPlanGateTest {
    private final MqttCommandPublisher publisher = mock(MqttCommandPublisher.class);
    private final ControlStateStore states = new ControlStateStore();
    private final RoutePlanService plans = mock(RoutePlanService.class);
    private final WorkZoneService zones = mock(WorkZoneService.class);
    private final ControlCommandService service = new ControlCommandService(states, mock(DeadmanService.class),
            new ControlResponseFactory(), publisher, mock(ControlRobotGuard.class));
    private final UUID planId = UUID.randomUUID();

    AutonomyPlanGateTest() {
        ReflectionTestUtils.setField(service, "routePlans", plans);
        ReflectionTestUtils.setField(service, "workZones", zones);
    }

    @Test void autonomousRequestPublishesOnlyTheSupervisedJetsonStartRequest() {
        var state = states.stateFor("R1");
        state.claim("operator", "운영자", "manual", Instant.now());
        var before = state.snapshot();
        var user = mock(SecurityUser.class);
        when(user.getAdminId()).thenReturn("operator");
        var result = service.changeMode("R1", new ChangeModeRequest("change-mode", "R1", "autonomous", "test",
                before.lockVersion(), planId), user);
        assertThat(result.accepted()).isTrue();
        verify(plans).get("R1", planId);
        verify(publisher).publishModeCommand(argThat(payload -> payload.lockVersion() == result.lockVersion()
                && payload.parameters().get("mode").equals("autonomous")));
        assertThat(state.snapshot().mode()).isEqualTo("autonomous");
        assertThat(service.autonomyAuthorityMillis("R1", result.commandId(), result.lockVersion())).isPositive();
        assertThat(service.autonomyAuthorityMillis("R1", "unrelated", result.lockVersion())).isZero();
        state.release("operator", Instant.now());
        assertThat(service.autonomyAuthorityMillis("R1", result.commandId(), result.lockVersion())).isZero();
    }

    @Test void authorityLeaseNeverOutlivesTheLockAndCannotCarryOverToAnotherVersion() {
        var state = states.stateFor("R1");
        var now = Instant.now();
        var lock = state.claim("operator", "운영자", "manual", now);
        var auto = state.changeMode("operator", "autonomous", now);
        state.recordAutonomyCommand("cmd-1");
        assertThat(state.autonomyAuthorityMillis("cmd-1", auto.lockVersion(), lock.expiresAt().minusMillis(700)))
                .isEqualTo(700);
        assertThat(state.autonomyAuthorityMillis("cmd-1", auto.lockVersion(), lock.expiresAt())).isZero();
        var next = state.claim("operator", "운영자", "autonomous", lock.expiresAt());
        assertThat(state.autonomyAuthorityMillis("cmd-1", next.lockVersion(), lock.expiresAt())).isZero();
    }

    @Test void rejectsLostControlAndEmergencyBeforeReadingPlan() {
        var state = states.stateFor("R1");
        reject("operator", state.snapshot().lockVersion(), ErrorCode.CONTROL_LOCK_NOT_HELD);
        state.claim("operator", "운영자", "manual", Instant.now());
        var lockVersion = state.snapshot().lockVersion();
        reject("other", lockVersion, ErrorCode.CONTROL_OWNED_BY_OTHER_USER);
        reject("operator", lockVersion - 1, ErrorCode.CONTROL_VERSION_CONFLICT);
        state.activateEmergency("test", Instant.now());
        reject("operator", state.snapshot().lockVersion(), ErrorCode.ROBOT_IN_EMERGENCY);
        verifyNoInteractions(plans, publisher);
    }

    @Test void verifiesCurrentWorkZoneWithoutRequiringAPlan() {
        var state = states.stateFor("R1");
        state.claim("operator", "운영자", "manual", Instant.now());
        var before = state.snapshot();
        var user = mock(SecurityUser.class);
        when(user.getAdminId()).thenReturn("operator");
        when(zones.getWorkZone("R1")).thenReturn(new WorkZoneResponse(2L, "R1", 11, null, null));
        for (int version : new int[]{10, 11}) {
            var request = new ChangeModeRequest("change-mode", "R1", "autonomous", "test",
                    before.lockVersion(), null, 2L, version);
            if (version == 10) {
                assertThatThrownBy(() -> service.changeMode("R1", request, user))
                        .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getErrorCode())
                                .isEqualTo(ErrorCode.WORK_ZONE_CONFLICT));
            } else {
                assertThat(service.changeMode("R1", request, user).accepted()).isTrue();
            }
        }
        verify(publisher).publishModeCommand(any());
    }

    private void reject(String operator, long version, ErrorCode code) {
        var user = mock(SecurityUser.class);
        when(user.getAdminId()).thenReturn(operator);
        var request = new ChangeModeRequest("change-mode", "R1", "autonomous", "test", version, planId);
        assertThatThrownBy(() -> service.changeMode("R1", request, user))
                .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getErrorCode()).isEqualTo(code));
    }
}
