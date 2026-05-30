package com.autonomousmower.control.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.robot.repository.RobotRepository;
import org.springframework.stereotype.Service;

@Service
public class ControlRobotGuard {

    private final RobotRepository robotRepository;

    public ControlRobotGuard(RobotRepository robotRepository) {
        this.robotRepository = robotRepository;
    }

    public void requireKnownRobot(String robotId) {
        if (!robotRepository.existsById(robotId)) {
            throw new BusinessException(ErrorCode.ROBOT_NOT_FOUND);
        }
    }
}
