package com.autonomousmower.history.service;

import com.autonomousmower.history.dto.*;
import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.*;
import static org.assertj.core.api.Assertions.*;

class MowingAreaEstimatorTest {
    final Instant start = Instant.parse("2026-11-07T00:00:00Z");
    final UUID run = UUID.randomUUID();
    Polygon zone() {
        var factory = new GeometryFactory(new PrecisionModel(), 4326);
        return factory.createPolygon(new Coordinate[]{new Coordinate(127,37), new Coordinate(127.001,37),
                new Coordinate(127.001,37.001), new Coordinate(127,37.001), new Coordinate(127,37)});
    }
    Sample gps(int t, double x) { return new Sample(start.plusSeconds(t), 37.0005, 127.0005 + x / 88903.7); }
    BladeObservation blade(int t, BladeObservation.State state, BladeObservation.Evidence source) {
        return new BladeObservation(UUID.randomUUID(), run, "R1", start.plusSeconds(t), state, source);
    }
    MowingEstimate estimate(int end, List<Sample> gps, List<BladeObservation> states) {
        return MowingAreaEstimator.calculate(zone(), start, start.plusSeconds(end), gps, states);
    }

    @Test void noObservationIsUnaggregatedAndConfirmedOffIsZero() {
        var path = List.of(gps(0,0),gps(2,10));
        assertThat(estimate(2,path,List.of())).isNull();
        var off = estimate(2,path,List.of(blade(0,BladeObservation.State.OFF,BladeObservation.Evidence.ROTATION)));
        assertThat(off.areaSquareMeters()).isZero();
        assertThat(off.partial()).isFalse();
    }

    @Test void duplicateSweepsAreUnionedAndSourceIsPreserved() {
        var states = List.of(blade(0,BladeObservation.State.ON,BladeObservation.Evidence.POWER),blade(2,BladeObservation.State.ON,BladeObservation.Evidence.POWER));
        var once = estimate(2,List.of(gps(0,0),gps(2,10)),states);
        var twice = estimate(4,List.of(gps(0,0),gps(2,10),gps(4,0)),states);
        assertThat(once.areaSquareMeters()).isBetween(6.7,6.9);
        assertThat(twice.areaSquareMeters()).isCloseTo(once.areaSquareMeters(),within(0.0001));
        assertThat(twice.evidence()).isEqualTo("power");
    }

    @Test void stateTransitionsAndThreeSecondExpirySplitInsideGpsSegments() {
        var path = List.of(gps(0,0),gps(2,10),gps(4,20));
        var full = estimate(4,path,List.of(blade(0,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION),blade(2,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION)));
        var stale = estimate(4,path,List.of(blade(0,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION)));
        assertThat(stale.partial()).isTrue();
        assertThat(stale.areaSquareMeters()).isBetween(9.9,10.2);
        assertThat(stale.areaSquareMeters()).isLessThan(full.areaSquareMeters());
        var late = estimate(2,List.of(gps(0,0),gps(2,10)),List.of(blade(1,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION)));
        assertThat(late.areaSquareMeters()).isBetween(3.5,3.7);
        assertThat(late.partial()).isTrue();
    }

    @Test void gpsGapAndConflictingStatesNeverBecomeMowing() {
        assertThat(estimate(3,List.of(gps(0,0),gps(3,10)),List.of(blade(0,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION)))).isNull();
        assertThat(estimate(2,List.of(gps(0,0),gps(2,10)),List.of(blade(0,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION),blade(0,BladeObservation.State.OFF,BladeObservation.Evidence.ROTATION)))).isNull();
    }

    @Test void clipsWorkZoneAndRunTimeAndCountsMixedSources() {
        var result = estimate(2,List.of(gps(0,0),gps(2,200)),List.of(blade(0,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION),blade(1,BladeObservation.State.ON,BladeObservation.Evidence.POWER)));
        assertThat(result.evidence()).isEqualTo("mixed");
        assertThat(result.areaSquareMeters()).isLessThan(40);
        var bounded = MowingAreaEstimator.calculate(zone(),start.plusSeconds(1),start.plusSeconds(2),List.of(gps(0,0),gps(2,10)),List.of(blade(0,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION)));
        assertThat(bounded.areaSquareMeters()).isBetween(3.5,3.7);
    }

    @Test void internalHoleIsExcludedAndUnknownEvidenceCannotConfirmRotation() {
        var shell = zone();
        var hole = shell.getFactory().createLinearRing(new Coordinate[]{new Coordinate(127.00051,37.00049),
                new Coordinate(127.00056,37.00049),new Coordinate(127.00056,37.00051),new Coordinate(127.00051,37.00051),new Coordinate(127.00051,37.00049)});
        var withHole = shell.getFactory().createPolygon((LinearRing)shell.getExteriorRing(),new LinearRing[]{hole});
        var points=List.of(gps(0,0),gps(2,10));
        var states=List.of(blade(0,BladeObservation.State.ON,BladeObservation.Evidence.ROTATION));
        var clipped=MowingAreaEstimator.calculate(withHole,start,start.plusSeconds(2),points,states);
        assertThat(clipped.areaSquareMeters()).isLessThan(estimate(2,points,states).areaSquareMeters());
        assertThat(estimate(2,points,List.of(blade(0,BladeObservation.State.UNKNOWN,BladeObservation.Evidence.UNKNOWN)))).isNull();
        assertThatThrownBy(() -> blade(0,BladeObservation.State.ON,BladeObservation.Evidence.UNKNOWN)).isInstanceOf(IllegalArgumentException.class);
    }
}
