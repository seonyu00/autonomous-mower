package com.autonomousmower.history.dto;

import java.util.List;

public record GeometryDto(
        String type,
        Object coordinates
) {
    public static GeometryDto lineString(List<List<Double>> coordinates) {
        return new GeometryDto("LineString", coordinates);
    }
}
