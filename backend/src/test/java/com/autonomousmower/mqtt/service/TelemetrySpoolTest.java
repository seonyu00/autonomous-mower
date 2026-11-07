package com.autonomousmower.mqtt.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.autonomousmower.mqtt.dto.MqttEventPayload;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.nio.file.Path;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;

class TelemetrySpoolTest {
    @TempDir Path directory;
    private final MqttInboundPersistenceService db = mock(MqttInboundPersistenceService.class);
    private TelemetrySpool spool() {
        return new TelemetrySpool(directory, new ObjectMapper().registerModule(new JavaTimeModule()), db, false);
    }

    @Test void failureRestartAndReplayPreserveOrderIdsAndObservationTimes() throws Exception {
        Instant now = Instant.parse("2026-11-07T00:00:00Z");
        var first = InboundRecord.event(new MqttEventPayload("1","A","warning","test","중단",now,"test"), now);
        var second = InboundRecord.event(new MqttEventPayload("2","A","info","test","복구",now.plusSeconds(3),"test"), now.plusSeconds(3));
        when(db.persist(any())).thenThrow(new DataAccessResourceFailureException("test outage")).thenReturn(true);
        var initial = spool();
        initial.append(first);
        initial.append(second);
        initial.drain();
        assertThat(initial.recording().state()).isEqualTo("buffered");
        initial.close();
        var restarted = spool();
        try {
            restarted.drain();
            restarted.drain();
            var calls = ArgumentCaptor.forClass(InboundRecord.class);
            verify(db,times(3)).persist(calls.capture());
            assertThat(calls.getAllValues()).containsExactly(first, first, second);
            assertThat(restarted.recording()).isEqualTo(new TelemetrySpool.Recording("available", false));
        } finally { restarted.close(); }
    }

    @Test void overflowPreservesExistingRecordsAndGapAcrossRestart() throws Exception {
        var store = spool();
        Instant now = Instant.now();
        var keep = InboundRecord.event(new MqttEventPayload("1","A","info","test","유지",now,"test"), now);
        store.append(keep);
        var tooBig = new MqttEventPayload("2","A","info","test","x".repeat(33 * 1024 * 1024),now,"test");
        store.append(InboundRecord.event(tooBig, now));
        assertThat(store.recording().possibleGap()).isTrue();
        store.close();
        store = spool();
        try {
            when(db.persist(keep)).thenReturn(true);
            store.drain();
            verify(db).persist(keep);
            verifyNoMoreInteractions(db);
            assertThat(store.recording().possibleGap()).isTrue();
        } finally { store.close(); }
    }
}
