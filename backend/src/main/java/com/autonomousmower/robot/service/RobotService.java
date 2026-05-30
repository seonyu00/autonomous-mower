package com.autonomousmower.robot.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.robot.dto.RobotResponse;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RobotService {

    private final RobotRepository robotRepository;

    public RobotService(RobotRepository robotRepository) {
        this.robotRepository = robotRepository;
    }

    @Transactional(readOnly = true)
    public List<RobotResponse> findAll() {
        return robotRepository.findAll().stream()
                .map(RobotResponse::summary)
                .toList();
    }

    @Transactional(readOnly = true)
    public RobotResponse findById(String robotId) {
        return RobotResponse.detail(getRobot(robotId));
    }

    @Transactional(readOnly = true)
    public Robot getRobot(String robotId) {
        return robotRepository.findById(robotId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROBOT_NOT_FOUND));
    }
}
