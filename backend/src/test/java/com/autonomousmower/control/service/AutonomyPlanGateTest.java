package com.autonomousmower.control.service;

import com.autonomousmower.control.dto.ChangeModeRequest;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.service.MqttCommandPublisher;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.workzone.service.RoutePlanService;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AutonomyPlanGateTest {
    @Test void filePreparationNeverStartsAutonomyWithoutVerifiedReadiness() {
        var publisher=mock(MqttCommandPublisher.class);
        var states=mock(ControlStateStore.class);
        var service=new ControlCommandService(states,mock(DeadmanService.class),mock(ControlResponseFactory.class),publisher,mock(ControlRobotGuard.class));
        var plans=mock(RoutePlanService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"routePlans",plans);
        var id=java.util.UUID.randomUUID();
        assertThatThrownBy(()->service.changeMode("R1",new ChangeModeRequest("change-mode","R1","autonomous","test",0,id),null))
                .isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.AUTONOMY_READINESS_UNCONFIRMED));
        verify(plans).get("R1",id);
        verifyNoInteractions(publisher,states);
    }
}
