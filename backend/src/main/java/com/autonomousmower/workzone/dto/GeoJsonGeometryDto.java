package com.autonomousmower.workzone.dto;

import java.util.List;

public record GeoJsonGeometryDto(
        String type,
        List<List<List<Double>>> coordinates
) {
}
