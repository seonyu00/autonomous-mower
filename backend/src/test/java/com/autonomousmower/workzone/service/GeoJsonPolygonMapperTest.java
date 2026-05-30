package com.autonomousmower.workzone.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.workzone.dto.GeoJsonGeometryDto;
import com.autonomousmower.workzone.dto.WorkZonePayload;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Polygon;

class GeoJsonPolygonMapperTest {

    private final GeoJsonPolygonMapper mapper = new GeoJsonPolygonMapper();

    @Test
    void validPolygonMapsToSrid4326JtsPolygon() {
        Polygon polygon = mapper.toPolygon(validPayload());

        assertThat(polygon.getSRID()).isEqualTo(4326);
        assertThat(polygon.getGeometryType()).isEqualTo("Polygon");
        assertThat(polygon.getExteriorRing().getNumPoints()).isEqualTo(5);
    }

    @Test
    void rejectsNon4326Srid() {
        WorkZonePayload payload = new WorkZonePayload("Polygon", 3857, validPayload().geometry());

        assertThatThrownBy(() -> mapper.toPolygon(payload))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void rejectsOpenRing() {
        WorkZonePayload payload = payload(List.of(
                List.of(127.0, 37.0),
                List.of(127.01, 37.0),
                List.of(127.01, 37.01),
                List.of(127.0, 37.01)
        ));

        assertThatThrownBy(() -> mapper.toPolygon(payload))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void rejectsSelfIntersectingExteriorRing() {
        WorkZonePayload payload = payload(List.of(
                List.of(127.0, 37.0),
                List.of(127.01, 37.01),
                List.of(127.01, 37.0),
                List.of(127.0, 37.01),
                List.of(127.0, 37.0)
        ));

        assertThatThrownBy(() -> mapper.toPolygon(payload))
                .isInstanceOf(BusinessException.class);
    }

    private WorkZonePayload validPayload() {
        return payload(List.of(
                List.of(127.0, 37.0),
                List.of(127.01, 37.0),
                List.of(127.01, 37.01),
                List.of(127.0, 37.01),
                List.of(127.0, 37.0)
        ));
    }

    private WorkZonePayload payload(List<List<Double>> exteriorRing) {
        return new WorkZonePayload(
                "Polygon",
                4326,
                new GeoJsonGeometryDto("Polygon", List.of(exteriorRing))
        );
    }
}
