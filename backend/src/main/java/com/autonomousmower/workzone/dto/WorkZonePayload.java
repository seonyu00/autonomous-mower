package com.autonomousmower.workzone.dto;

public record WorkZonePayload(
        String type,
        int srid,
        GeoJsonGeometryDto geometry
) {
}
