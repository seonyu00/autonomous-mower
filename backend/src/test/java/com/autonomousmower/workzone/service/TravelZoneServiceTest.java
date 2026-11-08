package com.autonomousmower.workzone.service;

import com.autonomousmower.workzone.dto.*;
import com.autonomousmower.workzone.entity.WorkZone;
import com.autonomousmower.workzone.repository.WorkZoneRepository;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.common.exception.BusinessException;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TravelZoneServiceTest {
    WorkZonePayload square(double size) {
        return new WorkZonePayload("Polygon",4326,new GeoJsonGeometryDto("Polygon",List.of(List.of(
                List.of(127.0,37.0),List.of(127.0+size,37.0),List.of(127.0+size,37.0+size),List.of(127.0,37.0+size),List.of(127.0,37.0)))));
    }
    @Test void requiresContainingPolygonAndSameVersion() {
        var repo=mock(WorkZoneRepository.class); var robots=mock(RobotService.class); var mapper=new GeoJsonPolygonMapper();
        var service=new WorkZoneService(repo,robots,mapper);
        var robot=new Robot("R1","test",LocalDateTime.now());
        var zone=new WorkZone(robot,mapper.toPolygon(square(.001)),LocalDateTime.now());
        when(repo.findByRobotRobotId("R1")).thenReturn(Optional.of(zone));
        when(repo.saveAndFlush(any())).thenAnswer(call->call.getArgument(0));
        assertThatThrownBy(()->service.saveTravelZone("R1",new WorkZoneRequest("R1",zone.getVersion(),square(.0005)))).isInstanceOf(BusinessException.class);
        service.saveTravelZone("R1",new WorkZoneRequest("R1",zone.getVersion(),square(.002)));
        assertThat(zone.getTravelPolygon().covers(zone.getZonePolygon())).isTrue();
        assertThatThrownBy(()->service.saveTravelZone("R1",new WorkZoneRequest("R1",999,square(.002)))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->service.saveWorkZone("R1",new WorkZoneRequest("R1",zone.getVersion(),square(.003)))).isInstanceOf(BusinessException.class);
    }
}
