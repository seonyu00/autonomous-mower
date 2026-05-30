package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.workzone.dto.SaveWorkZoneResponse;
import com.autonomousmower.workzone.dto.WorkZoneRequest;
import com.autonomousmower.workzone.dto.WorkZoneResponse;
import com.autonomousmower.workzone.entity.WorkZone;
import com.autonomousmower.workzone.repository.WorkZoneRepository;
import java.time.LocalDateTime;
import org.locationtech.jts.geom.Polygon;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkZoneService {

    private final WorkZoneRepository workZoneRepository;
    private final RobotService robotService;
    private final GeoJsonPolygonMapper polygonMapper;

    public WorkZoneService(
            WorkZoneRepository workZoneRepository,
            RobotService robotService,
            GeoJsonPolygonMapper polygonMapper
    ) {
        this.workZoneRepository = workZoneRepository;
        this.robotService = robotService;
        this.polygonMapper = polygonMapper;
    }

    @Transactional(readOnly = true)
    public WorkZoneResponse getWorkZone(String robotId) {
        robotService.getRobot(robotId);
        WorkZone workZone = workZoneRepository.findFirstByRobotRobotId(robotId)
                .orElseThrow(() -> new BusinessException(ErrorCode.WORK_ZONE_NOT_FOUND));
        return toResponse(workZone);
    }

    @Transactional
    public SaveWorkZoneResponse saveWorkZone(String robotId, WorkZoneRequest request) {
        if (!robotId.equals(request.robotId())) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }

        Robot robot = robotService.getRobot(robotId);
        Polygon polygon = polygonMapper.toPolygon(request.zone());
        LocalDateTime now = LocalDateTime.now();
        WorkZone workZone = workZoneRepository.findFirstByRobotRobotId(robotId)
                .map(existing -> updateExisting(existing, request.expectedVersion(), polygon, now))
                .orElseGet(() -> new WorkZone(robot, polygon, now));

        WorkZone saved = workZoneRepository.save(workZone);
        return new SaveWorkZoneResponse(true, robotId, saved.getZoneId(), saved.getVersion(), saved.getUpdatedAt());
    }

    private WorkZone updateExisting(WorkZone workZone, Integer expectedVersion, Polygon polygon, LocalDateTime now) {
        if (expectedVersion != null && expectedVersion != workZone.getVersion()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        workZone.replacePolygon(polygon, now);
        return workZone;
    }

    private WorkZoneResponse toResponse(WorkZone workZone) {
        return new WorkZoneResponse(
                workZone.getZoneId(),
                workZone.getRobot().getRobotId(),
                workZone.getVersion(),
                workZone.getUpdatedAt(),
                polygonMapper.fromPolygon(workZone.getZonePolygon())
        );
    }
}
