package com.autonomousmower.workzone.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.workzone.dto.WorkZoneRequest;
import com.autonomousmower.workzone.entity.WorkZone;
import com.autonomousmower.workzone.repository.WorkZoneRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.hibernate.exception.ConstraintViolationException;
import java.sql.SQLException;

@ExtendWith(MockitoExtension.class)
class WorkZoneServiceTest {
    @Mock WorkZoneRepository repository;
    @Mock RobotService robots;
    @Mock GeoJsonPolygonMapper mapper;
    WorkZoneService service;
    Robot robot;
    Polygon polygon;

    @BeforeEach
    void setUp() {
        robot = new Robot("test-robot", "test", LocalDateTime.now());
        polygon = new GeometryFactory().createPolygon(new Coordinate[]{
                new Coordinate(127, 37), new Coordinate(128, 37), new Coordinate(128, 38), new Coordinate(127, 37)});
        service = new WorkZoneService(repository, robots, mapper);
        when(robots.getRobot("test-robot")).thenReturn(robot);
        when(mapper.toPolygon(null)).thenReturn(polygon);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, 2})
    void existingZoneRequiresMatchingVersion(Integer expectedVersion) {
        when(repository.findByRobotRobotId("test-robot")).thenReturn(Optional.of(new WorkZone(robot, polygon, LocalDateTime.now())));
        assertConflict(expectedVersion);
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void deletedZoneCannotBeSilentlyRecreatedFromOldVersion() {
        when(repository.findByRobotRobotId("test-robot")).thenReturn(Optional.empty());
        assertConflict(1);
    }

    @Test
    void flushOptimisticConflictIsMappedToWorkZoneConflict() {
        when(repository.findByRobotRobotId("test-robot")).thenReturn(Optional.of(new WorkZone(robot, polygon, LocalDateTime.now())));
        when(repository.saveAndFlush(any())).thenThrow(new ObjectOptimisticLockingFailureException(WorkZone.class, 1L));
        assertConflict(1);
    }

    @Test
    void concurrentCreationUniqueViolationIsMappedToConflict() {
        when(repository.findByRobotRobotId("test-robot")).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("duplicate",
                new ConstraintViolationException("duplicate", new SQLException(), "uq_work_zone_robot_id")));
        assertConflict(null);
    }

    @Test
    void unrelatedConstraintFailureIsNotReportedAsVersionConflict() {
        when(repository.findByRobotRobotId("test-robot")).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("other constraint"));
        assertThatThrownBy(() -> service.saveWorkZone("test-robot", new WorkZoneRequest("test-robot", null, null)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void responseUsesFlushedVersion() {
        when(repository.findByRobotRobotId("test-robot")).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(service.saveWorkZone("test-robot", new WorkZoneRequest("test-robot", null, null)).version()).isEqualTo(1);
        verify(repository).saveAndFlush(any());
    }

    private void assertConflict(Integer version) {
        assertThatThrownBy(() -> service.saveWorkZone("test-robot", new WorkZoneRequest("test-robot", version, null)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.WORK_ZONE_CONFLICT));
    }
}
