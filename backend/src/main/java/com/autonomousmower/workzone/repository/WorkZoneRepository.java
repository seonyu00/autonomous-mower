package com.autonomousmower.workzone.repository;

import com.autonomousmower.workzone.entity.WorkZone;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkZoneRepository extends JpaRepository<WorkZone, Long> {

    Optional<WorkZone> findFirstByRobotRobotId(String robotId);
}
