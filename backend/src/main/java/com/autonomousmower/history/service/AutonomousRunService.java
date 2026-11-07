package com.autonomousmower.history.service;

import com.autonomousmower.history.dto.RunHistoryResponse;
import com.autonomousmower.history.dto.GeoJsonFeatureDto;
import com.autonomousmower.history.dto.GeometryDto;
import com.autonomousmower.history.dto.HistoryEventResponse;
import com.autonomousmower.history.entity.AutonomousRun;
import com.autonomousmower.history.repository.AutonomousRunRepository;
import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;
import com.autonomousmower.robot.service.RobotService;
import java.time.Instant;
import java.time.Duration;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 실제 장비 계약을 연결하기 전 검증된 입력을 받는 내부 서비스다. */
@Service
public class AutonomousRunService {
    private final AutonomousRunRepository runs;
    private final RobotService robots;
    private final Clock clock;

    public AutonomousRunService(AutonomousRunRepository runs, RobotService robots, Clock clock) {
        this.runs = runs; this.robots = robots; this.clock = clock;
    }

    @Transactional
    public void start(String robotId, UUID id, Instant startedAt, Instant observedAt) {
        var robot = robots.getRobot(robotId);
        if (!robot.isEnabled()) throw new IllegalArgumentException("비활성 로봇입니다.");
        var existing = runs.findById(id);
        if (existing.isPresent()) {
            var run = existing.get();
            if (!run.getRobotId().equals(robotId) || !run.getStartedAt().equals(startedAt.truncatedTo(java.time.temporal.ChronoUnit.MICROS)))
                throw new IllegalArgumentException("작업 식별자가 다른 시작 정보에 사용됐습니다.");
            return;
        }
        runs.save(new AutonomousRun(id, robotId, startedAt, observedAt));
    }

    @Transactional
    public void observe(String robotId, UUID id, Instant signalAt, Instant observedAt, boolean completed) {
        getRun(robotId, id).observe(signalAt, observedAt, completed);
    }

    @Transactional
    public void addPosition(String robotId, UUID id, Sample sample) {
        getRun(robotId, id).addPosition(sample);
    }

    private AutonomousRun getRun(String robotId, UUID id) {
        var robot = robots.getRobot(robotId);
        if (!robot.isEnabled()) throw new IllegalArgumentException("비활성 로봇입니다.");
        var run = runs.findById(id).orElseThrow(() -> new IllegalArgumentException("시작이 확인되지 않은 작업입니다."));
        if (!run.getRobotId().equals(robotId)) throw new IllegalArgumentException("작업의 로봇이 다릅니다.");
        return run;
    }

    @Transactional(readOnly = true)
    public List<RunHistoryResponse> find(String robotId, Instant from, Instant to) {
        robots.getRobot(robotId);
        if (from != null && to != null && from.isAfter(to)) throw new IllegalArgumentException("조회 기간이 역전됐습니다.");
        return runs.findByRobotIdOrderByStartedAtDesc(robotId).stream()
                .filter(r -> to == null || !r.getStartedAt().isAfter(to))
                .filter(r -> from == null || r.getEndedAt() == null || !r.getEndedAt().isBefore(from))
                .map(this::response).toList();
    }

    private RunHistoryResponse response(AutonomousRun run) {
        var samples = run.samples();
        var result = GpsDistanceCalculator.calculate(samples);
        List<GeoJsonFeatureDto> segments = new ArrayList<>();
        List<List<Double>> points = new ArrayList<>();
        Instant previous = null;
        for (Sample s : samples) {
            if (s.latitude() == null || (previous != null && Duration.between(previous, s.measuredAt()).compareTo(Duration.ofSeconds(3)) >= 0)) {
                appendSegment(segments, points); points = new ArrayList<>();
            }
            if (s.latitude() != null) points.add(List.of(s.longitude(), s.latitude()));
            previous = s.latitude() == null ? null : s.measuredAt();
        }
        appendSegment(segments, points);
        Instant checkedAt = clock.instant();
        String status = run.getEndedAt() != null ? "completed"
                : Duration.between(run.getLastObservedAt(), checkedAt).compareTo(Duration.ofSeconds(30)) >= 0
                ? "unconfirmed" : "running";
        var valid = samples.stream().filter(s -> s.latitude() != null).toList();
        boolean partial = result.hasGap() || run.getEndedAt() == null || valid.isEmpty()
                || valid.getFirst().measuredAt().isAfter(run.getStartedAt())
                || (run.getEndedAt() != null && valid.getLast().measuredAt().isBefore(run.getEndedAt()));
        List<HistoryEventResponse> events = new ArrayList<>();
        events.add(lifecycleEvent(run, "job-started", "자율주행 프로그램 시작 확인", run.getStartedAt()));
        if (run.getEndedAt() != null)
            events.add(lifecycleEvent(run, "job-completed", "자율주행 프로그램 종료 확인", run.getEndedAt()));
        return new RunHistoryResponse("run-" + run.getId(), run.getRobotId(), run.getStartedAt(), run.getEndedAt(),
                run.getLastObservedAt(), checkedAt, status, segments, result.distanceMeters(), result.hasGap(), partial, null, events);
    }

    private HistoryEventResponse lifecycleEvent(AutonomousRun run, String type, String message, Instant at) {
        return new HistoryEventResponse(run.getId() + "-" + type, run.getRobotId(),
                LocalDateTime.ofInstant(at, ZoneOffset.UTC), "info", type, message, null);
    }

    private void appendSegment(List<GeoJsonFeatureDto> segments, List<List<Double>> points) {
        if (points.isEmpty()) return;
        segments.add(new GeoJsonFeatureDto("Feature", points.size() == 1
                ? new GeometryDto("Point", points.getFirst()) : GeometryDto.lineString(List.copyOf(points)), Map.of("srid", 4326)));
    }
}
