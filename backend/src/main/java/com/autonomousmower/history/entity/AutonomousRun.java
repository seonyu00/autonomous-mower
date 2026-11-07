package com.autonomousmower.history.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.Id;
import jakarta.persistence.Column;
import jakarta.persistence.Version;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Embeddable;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import java.util.Objects;
import java.util.Comparator;
import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;

@Entity
@Table(name = "autonomous_run")
public class AutonomousRun {
    @Id
    private UUID id;
    @Column(nullable = false, length = 50)
    private String robotId;
    @Column(nullable = false)
    private Instant startedAt;
    @Column(nullable = false)
    private Instant lastSignalAt;
    @Column(nullable = false)
    private Instant lastObservedAt;
    private Instant endedAt;
    @Version
    private long version;
    @ElementCollection
    @CollectionTable(name = "autonomous_run_position", joinColumns = @JoinColumn(name = "run_id"))
    @OrderBy("measuredAt ASC")
    private List<Position> positions = new ArrayList<>();

    protected AutonomousRun() {}

    public AutonomousRun(UUID id, String robotId, Instant startedAt, Instant observedAt) {
        startedAt = startedAt.truncatedTo(ChronoUnit.MICROS);
        observedAt = observedAt.truncatedTo(ChronoUnit.MICROS);
        this.id = Objects.requireNonNull(id);
        this.robotId = Objects.requireNonNull(robotId);
        this.startedAt = Objects.requireNonNull(startedAt);
        if (startedAt.isAfter(observedAt)) throw new IllegalArgumentException("시작 시각이 관측 시각보다 늦습니다.");
        this.lastSignalAt = startedAt;
        this.lastObservedAt = observedAt;
    }

    public void observe(Instant signalAt, Instant observedAt, boolean completed) {
        signalAt = signalAt.truncatedTo(ChronoUnit.MICROS);
        observedAt = observedAt.truncatedTo(ChronoUnit.MICROS);
        if (signalAt.isBefore(startedAt) || signalAt.isAfter(observedAt))
            throw new IllegalArgumentException("작업 신호의 시각이 유효하지 않습니다.");
        // 재전송이나 늦게 도착한 신호로 최종 관측 시각을 새로 연장하지 않는다.
        if (signalAt.isBefore(lastSignalAt)) return;
        if (endedAt != null) return;
        if (signalAt.equals(lastSignalAt) && !completed) return;
        if (observedAt.isBefore(lastObservedAt)) throw new IllegalArgumentException("관측 시각이 역전됐습니다.");
        Instant completionAt = signalAt;
        if (completed && positions.stream().anyMatch(p -> p.measuredAt.isAfter(completionAt)))
            throw new IllegalArgumentException("종료 이후 위치 기록이 있습니다.");
        lastSignalAt = signalAt;
        lastObservedAt = observedAt;
        if (completed) endedAt = signalAt;
    }

    public void addPosition(Sample sample) {
        sample = new Sample(sample.measuredAt().truncatedTo(ChronoUnit.MICROS), sample.latitude(), sample.longitude());
        if (sample.measuredAt().isBefore(startedAt) || (endedAt != null && sample.measuredAt().isAfter(endedAt)))
            throw new IllegalArgumentException("작업 범위 밖의 위치입니다.");
        for (Position p : positions) {
            if (p.measuredAt.equals(sample.measuredAt())) {
                if (!Objects.equals(p.latitude, sample.latitude()) || !Objects.equals(p.longitude, sample.longitude()))
                    throw new IllegalArgumentException("같은 측정 시각의 좌표가 다릅니다.");
                return;
            }
        }
        positions.add(new Position(sample));
    }

    public UUID getId() { return id; }
    public String getRobotId() { return robotId; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getLastObservedAt() { return lastObservedAt; }
    public Instant getEndedAt() { return endedAt; }
    public List<Sample> samples() {
        return positions.stream().map(p -> new Sample(p.measuredAt, p.latitude, p.longitude))
                .sorted(Comparator.comparing(Sample::measuredAt)).toList();
    }

    @Embeddable
    public static class Position {
        @Column(nullable = false)
        private Instant measuredAt;
        private Double latitude;
        private Double longitude;
        protected Position() {}
        Position(Sample sample) {
            measuredAt = sample.measuredAt(); latitude = sample.latitude(); longitude = sample.longitude();
        }
    }
}
