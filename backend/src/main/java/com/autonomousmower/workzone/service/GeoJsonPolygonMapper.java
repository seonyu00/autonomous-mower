package com.autonomousmower.workzone.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.workzone.dto.GeoJsonGeometryDto;
import com.autonomousmower.workzone.dto.WorkZonePayload;
import java.util.ArrayList;
import java.util.List;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.locationtech.jts.operation.valid.IsValidOp;
import org.springframework.stereotype.Component;

@Component
public class GeoJsonPolygonMapper {

    static final int WGS84_SRID = 4326;

    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), WGS84_SRID);

    public Polygon toPolygon(WorkZonePayload payload) {
        if (payload == null
                || !"Polygon".equals(payload.type())
                || payload.srid() != WGS84_SRID
                || payload.geometry() == null
                || !"Polygon".equals(payload.geometry().type())) {
            throw invalidPolygon();
        }

        List<List<List<Double>>> rings = payload.geometry().coordinates();
        if (rings == null || rings.isEmpty()) {
            throw invalidPolygon();
        }

        LinearRing shell = toLinearRing(rings.getFirst());
        LinearRing[] holes = new LinearRing[Math.max(0, rings.size() - 1)];
        for (int index = 1; index < rings.size(); index++) {
            holes[index - 1] = toLinearRing(rings.get(index));
        }

        Polygon polygon = geometryFactory.createPolygon(shell, holes);
        polygon.setSRID(WGS84_SRID);
        if (!polygon.isValid()) {
            throw invalidPolygon();
        }
        return polygon;
    }

    public WorkZonePayload fromPolygon(Polygon polygon) {
        List<List<List<Double>>> rings = new ArrayList<>();
        rings.add(fromLinearRing(polygon.getExteriorRing().getCoordinates()));
        for (int index = 0; index < polygon.getNumInteriorRing(); index++) {
            rings.add(fromLinearRing(polygon.getInteriorRingN(index).getCoordinates()));
        }
        return new WorkZonePayload("Polygon", WGS84_SRID, new GeoJsonGeometryDto("Polygon", rings));
    }

    private LinearRing toLinearRing(List<List<Double>> ring) {
        if (ring == null || ring.size() < 4) {
            throw invalidPolygon();
        }

        Coordinate[] coordinates = new Coordinate[ring.size()];
        for (int index = 0; index < ring.size(); index++) {
            List<Double> position = ring.get(index);
            if (position == null || position.size() < 2) {
                throw invalidPolygon();
            }
            double longitude = position.get(0);
            double latitude = position.get(1);
            if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
                throw invalidPolygon();
            }
            coordinates[index] = new Coordinate(longitude, latitude);
        }

        if (!coordinates[0].equals2D(coordinates[coordinates.length - 1])) {
            throw invalidPolygon();
        }

        LinearRing linearRing = geometryFactory.createLinearRing(coordinates);
        if (!linearRing.isValid() || IsValidOp.isValid(linearRing) == false) {
            throw invalidPolygon();
        }
        return linearRing;
    }

    private List<List<Double>> fromLinearRing(Coordinate[] coordinates) {
        List<List<Double>> ring = new ArrayList<>(coordinates.length);
        for (Coordinate coordinate : coordinates) {
            ring.add(List.of(coordinate.x, coordinate.y));
        }
        return ring;
    }

    private BusinessException invalidPolygon() {
        return new BusinessException(ErrorCode.INVALID_REQUEST);
    }
}
