package com.autonomousmower.history.service;

import com.autonomousmower.history.dto.RunSignal;
import com.autonomousmower.history.entity.StoredRunSignal;
import com.autonomousmower.history.repository.StoredRunSignalRepository;
import com.autonomousmower.history.repository.AutonomousRunRepository;
import com.autonomousmower.robot.repository.RobotRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RunSignalPersistence {
    private final StoredRunSignalRepository signals;
    private final AutonomousRunRepository runs;
    private final AutonomousRunService service;
    private final RobotRepository robots;
    private final ObjectMapper mapper;
    public RunSignalPersistence(StoredRunSignalRepository signals, AutonomousRunRepository runs,
            AutonomousRunService service, RobotRepository robots, ObjectMapper mapper) {
        this.signals=signals; this.runs=runs; this.service=service; this.robots=robots; this.mapper=mapper;
    }

    @Transactional
    public boolean persist(RunSignal input, Instant observedAt) throws java.io.IOException {
        if (robots.findById(input.robotId()).filter(r -> r.isEnabled()).isEmpty()) return false;
        var existing=signals.findById(input.id());
        if (existing.isPresent()) {
            if (!mapper.readValue(existing.get().getPayload(), RunSignal.class).equals(input)) {
                existing.get().markConflict(); return false;
            }
            return !existing.get().isConflict();
        }
        var stored=signals.save(new StoredRunSignal(input.id(), input.runId(), input.robotId(), observedAt,
                mapper.writeValueAsString(input)));
        var records=signals.findByRunIdOrderByObservedAtAsc(input.runId());
        List<RunSignal> values=new ArrayList<>();
        Map<UUID, Instant> observed=new HashMap<>();
        for (var record:records) {
            if (record.isConflict() || !record.getRobotId().equals(input.robotId())) {
                stored.markConflict(); return false;
            }
            var value=mapper.readValue(record.getPayload(), RunSignal.class);
            values.add(value); observed.put(value.id(),record.getObservedAt());
        }
        var starts=values.stream().filter(s -> s.kind().equals("start")).toList();
        if (values.stream().anyMatch(s -> !s.kind().equals("gps") && s.signalAt().isAfter(observed.get(s.id())))) {
            stored.markConflict(); return false;
        }
        if (starts.isEmpty()) return true; // 다른 기록을 막지 않고 시작 신호를 기다린다.
        Instant start=starts.getFirst().signalAt();
        var ends=values.stream().filter(s -> s.kind().equals("end")).toList();
        Instant end=ends.isEmpty()?null:ends.getFirst().signalAt();
        var run=runs.findById(input.runId());
        if (starts.stream().anyMatch(s -> !s.signalAt().equals(start))
                || ends.stream().anyMatch(s -> !s.signalAt().equals(end))
                || values.stream().anyMatch(s -> s.signalAt().isBefore(start)
                    || (end!=null && s.signalAt().isAfter(end)))
                || run.filter(r -> !r.getRobotId().equals(input.robotId()) || !r.getStartedAt().equals(start)).isPresent()) {
            stored.markConflict(); return false;
        }
        Map<Instant, RunSignal> positions=new HashMap<>();
        for (var s:values) if (s.kind().equals("gps")) {
            var prior=positions.putIfAbsent(s.signalAt(),s);
            if (prior!=null && (!Objects.equals(prior.latitude(),s.latitude()) || !Objects.equals(prior.longitude(),s.longitude()))) {
                stored.markConflict(); return false;
            }
        }
        service.start(input.robotId(),input.runId(),start,observed.get(starts.getFirst().id()));
        for (var s:positions.values()) service.addPosition(input.robotId(),input.runId(),
                new GpsDistanceCalculator.Sample(s.signalAt(),s.latitude(),s.longitude()));
        // 원래 관측 순서를 보존하고 재처리 시각으로 30초 판정을 연장하지 않는다.
        for (var s:values) if (s.kind().equals("state") || s.kind().equals("end"))
            service.observe(input.robotId(),input.runId(),s.signalAt(),observed.get(s.id()),s.kind().equals("end"));
        return true;
    }
}
