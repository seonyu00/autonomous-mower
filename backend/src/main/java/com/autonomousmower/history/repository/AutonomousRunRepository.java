package com.autonomousmower.history.repository;

import com.autonomousmower.history.entity.AutonomousRun;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AutonomousRunRepository extends JpaRepository<AutonomousRun, UUID> {
    List<AutonomousRun> findByRobotIdOrderByStartedAtDesc(String robotId);
}
