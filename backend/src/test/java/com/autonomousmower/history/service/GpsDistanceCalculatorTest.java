package com.autonomousmower.history.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.data.Offset.offset;

import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class GpsDistanceCalculatorTest {

    private static final Instant START = Instant.parse("2026-11-07T00:00:00Z");

    @Test
    void sumsDistancesBetweenContinuousGpsMeasurements() {
        var result = GpsDistanceCalculator.calculate(List.of(
                sample(0, 0.0, 0.0), sample(1_000, 0.0, 0.001), sample(2_000, 0.0, 0.002)));
        assertThat(result.distanceMeters()).isCloseTo(222.39, offset(0.1));
        assertThat(result.hasGap()).isFalse();
    }

    @Test
    void excludesExactlyThreeSecondsAndLongerButKeepsOtherSegments() {
        var result = GpsDistanceCalculator.calculate(List.of(
                sample(0, 0.0, 0.0), sample(2_999, 0.0, 0.001),
                sample(5_999, 0.0, 0.010), sample(9_000, 0.0, 0.020),
                sample(10_000, 0.0, 0.021)));
        assertThat(result.distanceMeters()).isCloseTo(222.39, offset(0.1));
        assertThat(result.hasGap()).isTrue();
    }

    @Test
    void missingPositionBreaksTheRouteWithoutConnectingAcrossIt() {
        var result = GpsDistanceCalculator.calculate(List.of(
                sample(0, 0.0, 0.0), sample(1_000, null, null), sample(2_000, 0.0, 0.001)));
        assertThat(result.distanceMeters()).isNull();
        assertThat(result.hasGap()).isTrue();
    }

    @Test
    void distinguishesStationaryDistanceFromInsufficientData() {
        assertThat(GpsDistanceCalculator.calculate(List.of()).distanceMeters()).isNull();
        assertThat(GpsDistanceCalculator.calculate(List.of(sample(0, 0.0, 0.0))).distanceMeters()).isNull();
        assertThat(GpsDistanceCalculator.calculate(List.of(sample(0, 0.0, 0.0), sample(1_000, 0.0, 0.0)))
                .distanceMeters()).isZero();
    }

    @Test
    void rejectsInvalidCoordinatesAndNonIncreasingTimestamps() {
        assertThatThrownBy(() -> sample(0, 91.0, 0.0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> sample(0, null, 0.0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> GpsDistanceCalculator.calculate(List.of(
                sample(1_000, 0.0, 0.0), sample(1_000, 0.0, 0.001))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> GpsDistanceCalculator.calculate(List.of(
                sample(1_000, 0.0, 0.0), sample(0, 0.0, 0.001))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private Sample sample(long offsetMillis, Double latitude, Double longitude) {
        return new Sample(START.plusMillis(offsetMillis), latitude, longitude);
    }
}
