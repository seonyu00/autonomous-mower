package com.autonomousmower.mqtt.service;

import com.autonomousmower.robot.repository.RobotRepository;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class TelemetryRegistration {
    private record Snapshot(Set<String> ids, Instant checkedAt) {}
    private static final Duration VALIDITY = Duration.ofMinutes(5);
    private final RobotRepository robots;
    private final Clock clock;
    private final ExecutorService reader = Executors.newSingleThreadExecutor();
    private volatile Snapshot confirmed;
    private CompletableFuture<Void> inFlight;

    public TelemetryRegistration(RobotRepository robots, Clock clock) {
        this.robots = robots;
        this.clock = clock;
    }

    public boolean accepts(String robotId) {
        try {
            refresh().get(200, TimeUnit.MILLISECONDS);
        } catch (TimeoutException slowDatabase) {
            // 느린 조회는 한 건만 계속 진행하며 MQTT 수신 스레드를 붙잡지 않는다.
        } catch (ExecutionException failure) {
            if (!(failure.getCause() instanceof DataAccessException || failure.getCause() instanceof TransactionException)) {
                throw new IllegalStateException("등록 로봇 조회 실패", failure.getCause());
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
        Snapshot snapshot = confirmed;
        return snapshot != null && clock.instant().isBefore(snapshot.checkedAt().plus(VALIDITY))
                && snapshot.ids().contains(robotId);
    }

    private synchronized CompletableFuture<Void> refresh() {
        if (inFlight == null || inFlight.isDone()) {
            inFlight = CompletableFuture.runAsync(() -> {
                Instant checkedAt = clock.instant();
                confirmed = new Snapshot(Set.copyOf(robots.findEnabledIds()), checkedAt);
            }, reader);
        }
        return inFlight;
    }

    boolean wasConfirmed(String robotId) {
        Snapshot snapshot = confirmed;
        return snapshot != null && snapshot.ids().contains(robotId);
    }

    @PreDestroy
    void close() {
        reader.shutdownNow();
    }
}
