package com.autonomousmower.history.dto;

/** 실제 예초 완료를 보증하지 않는, 상태 관측 기반의 면적 추정이다. */
public record MowingEstimate(double areaSquareMeters, double coveragePercent, boolean partial, String evidence) {}
