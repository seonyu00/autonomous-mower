package com.autonomousmower.control.repository;

import com.autonomousmower.control.entity.CommandExecution;
import com.autonomousmower.control.entity.CommandExecutionStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

public interface CommandExecutionRepository extends JpaRepository<CommandExecution, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<CommandExecution> findByCommandId(String commandId);

    Optional<CommandExecution> findFirstByRobotRobotIdAndIdempotencyKeyOrderBySentAtDesc(
            String robotId,
            String idempotencyKey
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<CommandExecution> findByStatusInAndSentAtBefore(Collection<CommandExecutionStatus> statuses, Instant sentBefore);
}
