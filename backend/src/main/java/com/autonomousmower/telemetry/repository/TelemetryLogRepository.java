package com.autonomousmower.telemetry.repository;

import com.autonomousmower.telemetry.entity.TelemetryLog;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TelemetryLogRepository extends JpaRepository<TelemetryLog, Long> {

    List<TelemetryLog> findByRobotRobotIdAndRecordedAtBetweenOrderByRecordedAtAsc(
            String robotId,
            LocalDateTime from,
            LocalDateTime to
    );

    List<TelemetryLog> findByRobotRobotIdOrderByRecordedAtAsc(String robotId);
}
