package com.autonomousmower.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.autonomousmower.control.entity.CommandExecution;
import com.autonomousmower.control.repository.CommandExecutionRepository;
import com.autonomousmower.logs.entity.RobotEvent;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import com.autonomousmower.telemetry.entity.TelemetryLog;
import com.autonomousmower.telemetry.repository.TelemetryLogRepository;
import com.autonomousmower.workzone.entity.WorkZone;
import com.autonomousmower.workzone.repository.WorkZoneRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.JpaRepository;

class RepositoryContractTest {

    @Test
    void repositoriesUseExpectedEntityAndIdTypes() {
        assertThat(JpaRepository.class).isAssignableFrom(AdminRepository.class);
        assertThat(JpaRepository.class).isAssignableFrom(RobotRepository.class);
        assertThat(JpaRepository.class).isAssignableFrom(WorkZoneRepository.class);
        assertThat(JpaRepository.class).isAssignableFrom(TelemetryLogRepository.class);
        assertThat(JpaRepository.class).isAssignableFrom(RobotEventRepository.class);
        assertThat(JpaRepository.class).isAssignableFrom(CommandExecutionRepository.class);

        assertThat(Admin.class).isNotNull();
        assertThat(Robot.class).isNotNull();
        assertThat(WorkZone.class).isNotNull();
        assertThat(TelemetryLog.class).isNotNull();
        assertThat(RobotEvent.class).isNotNull();
        assertThat(CommandExecution.class).isNotNull();
    }
}
