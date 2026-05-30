package com.autonomousmower.robot.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.robot.dto.RobotResponse;
import com.autonomousmower.robot.service.RobotService;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/robots")
public class RobotController {

    private final RobotService robotService;

    public RobotController(RobotService robotService) {
        this.robotService = robotService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('robots:read')")
    public ApiResponse<List<RobotResponse>> listRobots() {
        return ApiResponse.success(robotService.findAll());
    }

    @GetMapping("/{robotId}")
    @PreAuthorize("hasAuthority('robots:read')")
    public ApiResponse<RobotResponse> getRobot(@PathVariable String robotId) {
        return ApiResponse.success(robotService.findById(robotId));
    }
}
