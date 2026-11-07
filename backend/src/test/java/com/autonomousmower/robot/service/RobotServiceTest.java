package com.autonomousmower.robot.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.telemetry.dto.TelemetryReception;
import com.autonomousmower.telemetry.service.TelemetryReceptionService;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class RobotServiceTest {
    @Test
    void detailUsesCurrentServerSnapshotAndHidesItWithoutTelemetryPermission() {
        var repository = mock(RobotRepository.class);
        var reception = mock(TelemetryReceptionService.class);
        var telemetry = mock(TelemetryReception.class);
        var state = new ControlStateStore();
        var robot = new Robot("test", "test", LocalDateTime.now());
        when(repository.findById("test")).thenReturn(Optional.of(robot));
        when(reception.snapshot("test")).thenReturn(telemetry);
        when(telemetry.state()).thenReturn("never-seen");
        var service = new RobotService(repository, reception, state);
        var initial = service.findById("test", true).control();
        assertThat(initial.lockState()).isEqualTo("none");
        assertThat(initial.emergency()).isFalse();
        state.stateFor("test").claim("operator", "operator", "manual", Instant.now());
        var held = service.findById("test", true).control();
        assertThat(held.lockState()).isEqualTo("held");
        assertThat(held.controlOwner()).isEqualTo("operator");
        assertThat(held.mode()).isEqualTo("manual");
        state.stateFor("test").activateEmergency("test", Instant.now());
        assertThat(service.findById("test", true).control().emergency()).isTrue();
        assertThat(service.findById("test", true).control().mode()).isEqualTo("emergency");
        assertThat(service.findById("test", false).control()).isNull();
    }
}
