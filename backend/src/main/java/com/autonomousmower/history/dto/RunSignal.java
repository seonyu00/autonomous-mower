package com.autonomousmower.history.dto;

import java.time.Instant;
import java.util.UUID;
import java.util.Objects;
import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;

/** 인증된 실제 수신 경로 연결 전 PC에서 검증하는 내부 입력이다. */
public record RunSignal(UUID id, UUID runId, String robotId, String kind, Instant signalAt,
        Double latitude, Double longitude) {
    public RunSignal {
        Objects.requireNonNull(id); Objects.requireNonNull(runId); Objects.requireNonNull(signalAt);
        if (robotId == null || robotId.isBlank() || robotId.length() > 50)
            throw new IllegalArgumentException("로봇 ID가 유효하지 않습니다.");
        if (!java.util.Set.of("start", "state", "end", "gps").contains(kind))
            throw new IllegalArgumentException("지원하지 않는 작업 신호입니다.");
        signalAt = signalAt.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        if (kind.equals("gps")) new Sample(signalAt, latitude, longitude);
        else if (latitude != null || longitude != null) throw new IllegalArgumentException("위치는 GPS 신호에만 포함합니다.");
    }
}
