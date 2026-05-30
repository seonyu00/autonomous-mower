package com.autonomousmower.control.model;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class ControlStateStore {

    private static final Duration DEFAULT_LOCK_TTL = Duration.ofMinutes(5);

    private final Map<String, MutableControlState> states = new ConcurrentHashMap<>();

    public MutableControlState stateFor(String robotId) {
        return states.computeIfAbsent(robotId, MutableControlState::new);
    }

    public static class MutableControlState {
        private final String robotId;
        private String lockState = "none";
        private String controlOwner;
        private String controlOwnerName;
        private String mode = "idle";
        private boolean emergency;
        private long lockVersion;
        private Instant expiresAt;
        private String reason;
        private Instant updatedAt = Instant.now();
        private Instant lastCommandAt;
        private boolean stopIssuedForTimeout;

        MutableControlState(String robotId) {
            this.robotId = robotId;
        }

        public synchronized ControlLockSnapshot snapshot() {
            refreshExpiration(Instant.now());
            return snapshotWithoutRefresh();
        }

        public synchronized ControlLockSnapshot claim(String owner, String ownerName, String requestedMode, Instant now) {
            refreshExpiration(now);
            if ("held".equals(lockState) && !owner.equals(controlOwner)) {
                throw new com.autonomousmower.common.exception.BusinessException(
                        com.autonomousmower.common.exception.ErrorCode.CONTROL_OWNED_BY_OTHER_USER
                );
            }
            lockState = "held";
            controlOwner = owner;
            controlOwnerName = ownerName;
            mode = requestedMode;
            expiresAt = now.plus(DEFAULT_LOCK_TTL);
            reason = "claim-control";
            updatedAt = now;
            lockVersion++;
            return snapshotWithoutRefresh();
        }

        public synchronized ControlLockSnapshot release(String owner, Instant now) {
            refreshExpiration(now);
            requireOwner(owner);
            lockState = "none";
            controlOwner = null;
            controlOwnerName = null;
            mode = "idle";
            expiresAt = null;
            reason = "release-control";
            updatedAt = now;
            lockVersion++;
            return snapshotWithoutRefresh();
        }

        public synchronized ControlLockSnapshot takeover(String owner, String ownerName, String takeoverReason, Instant now) {
            refreshExpiration(now);
            lockState = "held";
            controlOwner = owner;
            controlOwnerName = ownerName;
            expiresAt = now.plus(DEFAULT_LOCK_TTL);
            reason = takeoverReason == null || takeoverReason.isBlank() ? "takeover-control" : takeoverReason;
            updatedAt = now;
            lockVersion++;
            return snapshotWithoutRefresh();
        }

        public synchronized ControlLockSnapshot changeMode(String owner, String requestedMode, Instant now) {
            refreshExpiration(now);
            requireOwner(owner);
            requireNotEmergency();
            mode = requestedMode;
            reason = "change-mode";
            updatedAt = now;
            lockVersion++;
            return snapshotWithoutRefresh();
        }

        public synchronized ControlLockSnapshot activateEmergency(String reason, Instant now) {
            emergency = true;
            mode = "emergency";
            this.reason = reason == null || reason.isBlank() ? "emergency-stop" : reason;
            updatedAt = now;
            lockVersion++;
            return snapshotWithoutRefresh();
        }

        public synchronized ControlLockSnapshot resetEmergency(
                String requester,
                boolean canTakeover,
                String reason,
                Instant now
        ) {
            if (!emergency) {
                throw new com.autonomousmower.common.exception.BusinessException(
                        com.autonomousmower.common.exception.ErrorCode.ROBOT_NOT_IN_EMERGENCY
                );
            }
            if (controlOwner != null && !controlOwner.equals(requester) && !canTakeover) {
                throw new com.autonomousmower.common.exception.BusinessException(
                        com.autonomousmower.common.exception.ErrorCode.CONTROL_OWNED_BY_OTHER_USER
                );
            }
            emergency = false;
            mode = "idle";
            this.reason = reason == null || reason.isBlank() ? "reset-after-emergency" : reason;
            updatedAt = now;
            lockVersion++;
            return snapshotWithoutRefresh();
        }

        public synchronized void recordCommand(Instant now) {
            lastCommandAt = now;
            stopIssuedForTimeout = false;
        }

        public synchronized boolean shouldIssueDeadmanStop(Instant now, Duration timeout) {
            return lastCommandAt != null
                    && !stopIssuedForTimeout
                    && now.isAfter(lastCommandAt.plus(timeout));
        }

        public synchronized void markDeadmanStopIssued(Instant now) {
            stopIssuedForTimeout = true;
            reason = "deadman-timeout";
            updatedAt = now;
        }

        public synchronized void requireOwner(String owner) {
            if (!"held".equals(lockState) || controlOwner == null) {
                throw new com.autonomousmower.common.exception.BusinessException(
                        com.autonomousmower.common.exception.ErrorCode.CONTROL_LOCK_NOT_HELD
                );
            }
            if (!controlOwner.equals(owner)) {
                throw new com.autonomousmower.common.exception.BusinessException(
                        com.autonomousmower.common.exception.ErrorCode.CONTROL_OWNED_BY_OTHER_USER
                );
            }
        }

        public synchronized void requireNotEmergency() {
            if (emergency) {
                throw new com.autonomousmower.common.exception.BusinessException(
                        com.autonomousmower.common.exception.ErrorCode.ROBOT_IN_EMERGENCY
                );
            }
        }

        private void refreshExpiration(Instant now) {
            if ("held".equals(lockState) && expiresAt != null && !expiresAt.isAfter(now)) {
                lockState = "expired";
                controlOwner = null;
                controlOwnerName = null;
                reason = "lock-expired";
                updatedAt = now;
                lockVersion++;
            }
        }

        private ControlLockSnapshot snapshotWithoutRefresh() {
            return new ControlLockSnapshot(
                    robotId,
                    lockState,
                    controlOwner,
                    controlOwnerName,
                    mode,
                    emergency,
                    lockVersion,
                    expiresAt,
                    reason,
                    updatedAt
            );
        }
    }
}
