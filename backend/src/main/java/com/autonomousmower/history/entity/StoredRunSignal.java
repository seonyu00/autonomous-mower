package com.autonomousmower.history.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "stored_run_signal")
public class StoredRunSignal {
    @Id private UUID id;
    @Column(nullable = false) private UUID runId;
    @Column(nullable = false, length = 50) private String robotId;
    @Column(nullable = false) private Instant observedAt;
    @Column(nullable = false, columnDefinition = "text") private String payload;
    @Column(nullable = false) private boolean conflict;
    protected StoredRunSignal() {}
    public StoredRunSignal(UUID id, UUID runId, String robotId, Instant observedAt, String payload) {
        this.id=id; this.runId=runId; this.robotId=robotId; this.observedAt=observedAt; this.payload=payload;
    }
    public UUID getRunId() { return runId; }
    public String getRobotId() { return robotId; }
    public Instant getObservedAt() { return observedAt; }
    public String getPayload() { return payload; }
    public boolean isConflict() { return conflict; }
    public void markConflict() { conflict=true; }
}
