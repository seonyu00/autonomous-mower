package com.autonomousmower.logs.repository;

import com.autonomousmower.logs.entity.RobotEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RobotEventRepository extends JpaRepository<RobotEvent, String> {

    @Query("""
            select event from RobotEvent event
            where (:robotId is null or event.robot.robotId = :robotId)
              and (:severity is null or lower(event.severity) = lower(:severity))
              and event.occurredAt >= coalesce(:from, event.occurredAt)
              and event.occurredAt <= coalesce(:to, event.occurredAt)
            order by event.occurredAt desc
            """)
    List<RobotEvent> findInDateRange(
            @Param("robotId") String robotId,
            @Param("severity") String severity,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to
    );

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
