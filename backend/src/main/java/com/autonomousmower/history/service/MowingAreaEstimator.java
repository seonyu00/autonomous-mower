package com.autonomousmower.history.service;

import com.autonomousmower.history.dto.BladeObservation;
import com.autonomousmower.history.dto.BladeObservation.State;
import com.autonomousmower.history.dto.BladeObservation.Evidence;
import com.autonomousmower.history.dto.MowingEstimate;
import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.operation.union.UnaryUnionOp;

public final class MowingAreaEstimator {
    private MowingAreaEstimator() {}

    public static MowingEstimate calculate(Polygon zone, Instant start, Instant end,
            List<Sample> gps, List<BladeObservation> observations) {
        if (!end.isAfter(start)) return null;
        if (zone == null || zone.isEmpty() || !zone.isValid() || zone.getSRID() != 4326) {
            throw new IllegalArgumentException("유효한 WGS84 작업 구역이 필요합니다.");
        }
        var bounds = zone.getEnvelopeInternal();
        if (bounds.getWidth() > 1 || bounds.getHeight() > 1 || Math.abs(bounds.getMinY()) > 85 || Math.abs(bounds.getMaxY()) > 85) {
            throw new IllegalArgumentException("지원하는 지역 좌표 범위를 벗어났습니다.");
        }
        double north = 6378137 * Math.PI / 180;
        double east = north * Math.cos(Math.toRadians((bounds.getMinY() + bounds.getMaxY()) / 2));
        Polygon metricZone = (Polygon) zone.copy();
        metricZone.apply((CoordinateFilter) c -> { c.x = (c.x - bounds.getMinX()) * east; c.y = (c.y - bounds.getMinY()) * north; });
        metricZone.geometryChanged();
        var states = new TreeMap<Instant, BladeObservation>();
        for (var o : observations) {
            states.merge(o.measuredAt(), o, (a, b) -> a.state() == b.state() && a.evidence() == b.evidence() ? a :
                    new BladeObservation(a.id(), a.runId(), a.robotId(), a.measuredAt(), State.UNKNOWN, Evidence.UNKNOWN));
        }
        var samples = gps.stream().sorted(Comparator.comparing(Sample::measuredAt)).toList();
        var transitions = new TreeSet<Instant>();
        for (var t : states.keySet()) { transitions.add(t); transitions.add(t.plusSeconds(3)); }
        boolean partial = samples.isEmpty() || samples.getFirst().measuredAt().isAfter(start) || samples.getLast().measuredAt().isBefore(end);
        boolean known = false;
        Set<Evidence> sources = new HashSet<>();
        List<Geometry> swaths = new ArrayList<>();
        for (int i = 1; i < samples.size(); i++) {
            var a = samples.get(i - 1); var b = samples.get(i);
            if (!b.measuredAt().isAfter(a.measuredAt())) throw new IllegalArgumentException("GPS 측정 시각이 중복됐습니다.");
            Instant low = a.measuredAt().isAfter(start) ? a.measuredAt() : start;
            Instant high = b.measuredAt().isBefore(end) ? b.measuredAt() : end;
            if (!high.isAfter(low)) continue;
            if (a.latitude() == null || b.latitude() == null || Duration.between(a.measuredAt(), b.measuredAt()).compareTo(Duration.ofSeconds(3)) >= 0) {
                partial = true; continue;
            }
            var cuts = new TreeSet<Instant>(); cuts.add(low); cuts.add(high);
            cuts.addAll(transitions.subSet(low, false, high, false));
            var times = new ArrayList<>(cuts);
            for (int j = 1; j < times.size(); j++) {
                var from = times.get(j - 1); var to = times.get(j);
                var observation = states.floorEntry(from);
                if (observation == null || !from.isBefore(observation.getKey().plusSeconds(3)) || observation.getValue().state() == State.UNKNOWN) {
                    partial = true; continue;
                }
                known = true;
                sources.add(observation.getValue().evidence());
                if (observation.getValue().state() != State.ON) continue;
                double duration = Duration.between(a.measuredAt(), b.measuredAt()).toNanos();
                double f = Duration.between(a.measuredAt(), from).toNanos() / duration;
                double t = Duration.between(a.measuredAt(), to).toNanos() / duration;
                var p = metricPoint(a, b, f, bounds.getMinX(), bounds.getMinY(), east, north);
                var q = metricPoint(a, b, t, bounds.getMinX(), bounds.getMinY(), east, north);
                // 날 중심이 보정된 GPS 기준점과 같다는 기하 모델이다. 실제 절삭을 보증하지 않는다.
                swaths.add(metricZone.getFactory().createLineString(new Coordinate[]{p, q}).buffer(0.650 / 2));
            }
        }
        if (!known) return null;
        double area = swaths.isEmpty() ? 0 : UnaryUnionOp.union(swaths).intersection(metricZone).getArea();
        return new MowingEstimate(area, Math.min(100, area / metricZone.getArea() * 100), partial,
                sources.size() > 1 ? "mixed" : sources.contains(Evidence.ROTATION) ? "rotation" : "power");
    }

    private static Coordinate metricPoint(Sample a, Sample b, double t, double west, double south, double east, double north) {
        return new Coordinate((a.longitude() + (b.longitude() - a.longitude()) * t - west) * east,
                (a.latitude() + (b.latitude() - a.latitude()) * t - south) * north);
    }
}
