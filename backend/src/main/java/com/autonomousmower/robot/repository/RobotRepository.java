package com.autonomousmower.robot.repository;

import com.autonomousmower.robot.entity.Robot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.Set;

public interface RobotRepository extends JpaRepository<Robot, String> {
    @Query("select r.robotId from Robot r where r.enabled = true")
    Set<String> findEnabledIds();
}
