package com.autonomousmower.history.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** 실제 GPS 측정 시각이 확인된 위치만 거리 계산에 사용한다. */
public final class GpsDistanceCalculator {

    private static final Duration GPS_GAP = Duration.ofSeconds(3);
    private static final double EARTH_RADIUS_METERS = 6_371_008.8;

    private GpsDistanceCalculator() {
    }

    public static Result calculate(List<Sample> samples) {
        Objects.requireNonNull(samples, "samples must not be null");
        Sample previousPosition = null;
        Instant previousTime = null;
        double distance = 0;
        boolean hasSegment = false;
        boolean hasGap = false;

        for (Sample sample : samples) {
            Objects.requireNonNull(sample, "sample must not be null");
            if (previousTime != null && !sample.measuredAt().isAfter(previousTime)) {
                throw new IllegalArgumentException("GPS 측정 시각은 중복 없이 시간순이어야 합니다.");
            }
            previousTime = sample.measuredAt();

            if (sample.latitude() == null) {
                hasGap = true;
                previousPosition = null;
                continue;
            }
            if (previousPosition != null) {
                if (Duration.between(previousPosition.measuredAt(), sample.measuredAt()).compareTo(GPS_GAP) >= 0) {
                    hasGap = true;
                } else {
                    distance += distanceMeters(previousPosition, sample);
                    hasSegment = true;
                }
            }
            previousPosition = sample;
        }
        return new Result(hasSegment ? distance : null, hasGap);
    }

    private static double distanceMeters(Sample from, Sample to) {
        double lat1 = Math.toRadians(from.latitude());
        double lat2 = Math.toRadians(to.latitude());
        double latDifference = lat2 - lat1;
        double lonDifference = Math.toRadians(to.longitude() - from.longitude());
        double a = Math.pow(Math.sin(latDifference / 2), 2)
                + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(lonDifference / 2), 2);
        return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, a)));
    }

    public record Sample(Instant measuredAt, Double latitude, Double longitude) {
        public Sample {
            Objects.requireNonNull(measuredAt, "measuredAt must not be null");
            if ((latitude == null) != (longitude == null)
                    || (latitude != null && (!Double.isFinite(latitude) || !Double.isFinite(longitude)
                    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180))) {
                throw new IllegalArgumentException("GPS 좌표는 유효한 위도·경도 쌍이거나 모두 없어야 합니다.");
            }
        }
    }

    public record Result(Double distanceMeters, boolean hasGap) {
    }
}
