package com.autonomousmower.history.dto;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

/** 실제 장비의 주기적 상태 입력을 연결하기 전 사용하는 내부 관측 계약이다. */
public record BladeObservation(UUID id, UUID runId, String robotId, Instant measuredAt, State state, Evidence evidence) {
    public enum State { ON, OFF, UNKNOWN }
    public enum Evidence { ROTATION, POWER, UNKNOWN }
    public BladeObservation {
        Objects.requireNonNull(id); Objects.requireNonNull(runId); Objects.requireNonNull(measuredAt);
        Objects.requireNonNull(state); Objects.requireNonNull(evidence);
        if (robotId == null || robotId.isBlank() || robotId.length() > 50) throw new IllegalArgumentException("로봇 ID가 유효하지 않습니다.");
        if (evidence == Evidence.UNKNOWN && state != State.UNKNOWN) throw new IllegalArgumentException("출처가 없으면 날 상태를 확정하지 않습니다.");
        measuredAt = measuredAt.truncatedTo(ChronoUnit.MICROS);
    }
}
