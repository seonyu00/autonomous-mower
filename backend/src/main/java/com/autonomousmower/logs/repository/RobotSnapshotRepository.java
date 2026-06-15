package com.autonomousmower.logs.repository;

import com.autonomousmower.logs.entity.RobotSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RobotSnapshotRepository extends JpaRepository<RobotSnapshot, String> {
}
