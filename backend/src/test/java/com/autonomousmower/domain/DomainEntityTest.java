package com.autonomousmower.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.telemetry.entity.TelemetryLog;
import com.autonomousmower.workzone.entity.WorkZone;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;

class DomainEntityTest {

    private static final int WGS84_SRID = 4326;
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), WGS84_SRID);

    @Test
    void workZoneUsesPolygonWithSrid4326AndPointContainment() {
        Robot robot = new Robot("MOWER-01", "Jetson-Orin-Mower", LocalDateTime.now());
        Polygon polygon = polygon();
        WorkZone workZone = new WorkZone(robot, polygon, LocalDateTime.now());

        Point inside = geometryFactory.createPoint(new Coordinate(127.01, 37.01));

        assertThat(workZone.getZonePolygon().getSRID()).isEqualTo(WGS84_SRID);
        assertThat(workZone.isPointInside(inside)).isTrue();
    }

    @Test
    void telemetryLogUsesPointWithSrid4326AndStateHelpers() {
        Robot robot = new Robot("MOWER-01", "Jetson-Orin-Mower", LocalDateTime.now());
        Point point = geometryFactory.createPoint(new Coordinate(127.01, 37.01));
        TelemetryLog log = new TelemetryLog(robot, point, 10, "ERROR", LocalDateTime.now());

        assertThat(log.getLocationPoint().getSRID()).isEqualTo(WGS84_SRID);
        assertThat(log.isBatteryCritical()).isTrue();
        assertThat(log.isErrorState()).isTrue();
    }

    private Polygon polygon() {
        Coordinate[] coordinates = {
                new Coordinate(127.0, 37.0),
                new Coordinate(127.02, 37.0),
                new Coordinate(127.02, 37.02),
                new Coordinate(127.0, 37.02),
                new Coordinate(127.0, 37.0)
        };
        LinearRing shell = geometryFactory.createLinearRing(coordinates);
        return geometryFactory.createPolygon(shell);
    }
}
