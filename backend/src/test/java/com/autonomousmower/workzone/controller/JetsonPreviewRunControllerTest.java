package com.autonomousmower.workzone.controller;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.workzone.dto.WorkZoneResponse;
import com.autonomousmower.workzone.service.WorkZoneService;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class JetsonPreviewRunControllerTest {
    private final ControlStateStore controls = new ControlStateStore();
    private final WorkZoneService zones = mock(WorkZoneService.class);
    private final Clock clock = mock(Clock.class);
    private final SecurityUser operator = mock(SecurityUser.class);
    private final JetsonPreviewRunController controller = new JetsonPreviewRunController(controls, zones, clock);

    @Test
    void expiresWithoutBrowserRenewalAndDoesNotRestartOnLateRenewal() {
        var now = Instant.now();
        when(clock.instant()).thenReturn(now);
        var ticket = claim(now);
        controller.start("robot", ticket, operator);
        assertThatThrownBy(() -> controller.start("robot", ticket, operator)).isInstanceOf(BusinessException.class);
        when(clock.instant()).thenReturn(now.plusSeconds(4));
        controller.renew("robot", ticket.id(), operator);
        when(clock.instant()).thenReturn(now.plusSeconds(9));
        assertThat(controller.current("robot").getBody().data()).isNull();
        assertThatThrownBy(() -> controller.renew("robot", ticket.id(), operator)).isInstanceOf(BusinessException.class);
    }

    @Test
    void releasingControlRemovesTheRequest() {
        var now = Instant.now();
        when(clock.instant()).thenReturn(now);
        var ticket = claim(now);
        controller.start("robot", ticket, operator);
        assertThat(controller.current("robot").getBody().data()).isEqualTo(ticket);
        controls.stateFor("robot").release("operator", now);
        assertThat(controller.current("robot").getBody().data()).isNull();
    }

    private JetsonPreviewRunController.Ticket claim(Instant now) {
        when(operator.getAdminId()).thenReturn("operator");
        when(zones.getWorkZone("robot")).thenReturn(new WorkZoneResponse(2L, "robot", 11, null, null));
        var state = controls.stateFor("robot").claim("operator", "operator", "idle", now);
        return new JetsonPreviewRunController.Ticket(UUID.randomUUID(), 2, 11, state.lockVersion());
    }
}
