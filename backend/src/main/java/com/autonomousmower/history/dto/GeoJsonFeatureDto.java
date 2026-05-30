package com.autonomousmower.history.dto;

import java.util.Map;

public record GeoJsonFeatureDto(
        String type,
        GeometryDto geometry,
        Map<String, Object> properties
) {
}
