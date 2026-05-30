package com.autonomousmower.control.service;

import com.autonomousmower.control.model.ControlStateStore;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class DeadmanService {

    private static final Duration DEFAULT_TIMEOUT = Duration.ofMillis(500);

    private final ControlStateStore controlStateStore;
    private final ControlEventPublisher controlEventPublisher;
    private final Set<String> trackedRobots = ConcurrentHashMap.newKeySet();

    public DeadmanService(ControlStateStore controlStateStore, ControlEventPublisher controlEventPublisher) {
        this.controlStateStore = controlStateStore;
        this.controlEventPublisher = controlEventPublisher;
    }

    public void recordCommand(String robotId, Instant commandAt) {
        controlStateStore.stateFor(robotId).recordCommand(commandAt);
        trackedRobots.add(robotId);
    }

    public void evaluateTimeouts() {
        Instant now = Instant.now();
        for (String robotId : trackedRobots) {
            evaluateTimeout(robotId, now, DEFAULT_TIMEOUT);
        }
    }

    @Scheduled(fixedRate = 100)
    public void evaluateTimeoutsOnSchedule() {
        evaluateTimeouts();
    }

    public boolean evaluateTimeout(String robotId, Instant now, Duration timeout) {
        ControlStateStore.MutableControlState state = controlStateStore.stateFor(robotId);
        if (!state.shouldIssueDeadmanStop(now, timeout)) {
            return false;
        }
        state.markDeadmanStopIssued(now);
        controlEventPublisher.publishSyntheticStop(robotId, "deadman-timeout");
        return true;
    }
}
