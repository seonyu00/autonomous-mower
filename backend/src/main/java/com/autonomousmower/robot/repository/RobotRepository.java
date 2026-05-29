package com.autonomousmower.robot.repository;

import com.autonomousmower.robot.entity.Robot;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RobotRepository extends JpaRepository<Robot, String> {
}
