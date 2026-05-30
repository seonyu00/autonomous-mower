package com.autonomousmower.logs.repository;

import com.autonomousmower.logs.entity.RobotEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RobotEventRepository extends JpaRepository<RobotEvent, String> {

    List<RobotEvent> findByRobotRobotIdOrderByOccurredAtDesc(String robotId);

    List<RobotEvent> findByRobotRobotIdAndSeverityIgnoreCaseOrderByOccurredAtDesc(String robotId, String severity);

    List<RobotEvent> findByRobotRobotIdAndOccurredAtBetweenOrderByOccurredAtDesc(
            String robotId,
            LocalDateTime from,
            LocalDateTime to
    );

    List<RobotEvent> findByRobotRobotIdAndSeverityIgnoreCaseAndOccurredAtBetweenOrderByOccurredAtDesc(
            String robotId,
            String severity,
            LocalDateTime from,
            LocalDateTime to
    );

    List<RobotEvent> findAllByOrderByOccurredAtDesc();

    List<RobotEvent> findBySeverityIgnoreCaseOrderByOccurredAtDesc(String severity);
}
