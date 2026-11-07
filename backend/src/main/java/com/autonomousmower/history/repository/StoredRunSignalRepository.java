package com.autonomousmower.history.repository;

import java.util.*;
import com.autonomousmower.history.entity.StoredRunSignal;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoredRunSignalRepository extends JpaRepository<StoredRunSignal, UUID> {
    List<StoredRunSignal> findByRunIdOrderByObservedAtAsc(UUID runId);
    List<StoredRunSignal> findByRobotIdOrderByObservedAtAsc(String robotId);
}
