package com.autonomousmower.mqtt.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.autonomousmower.robot.repository.RobotRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class TelemetryRegistrationTest {
    private final Clock clock = mock(Clock.class);
    private final RobotRepository robots = mock(RobotRepository.class);
    private final TelemetryRegistration registration = new TelemetryRegistration(robots, clock);
    private final Instant start = Instant.parse("2026-11-07T00:00:00Z");

    @AfterEach void close() { registration.close(); }

    @Test
    void cacheRequiresSuccessfulLookupAndExpiresEvenWhileMessagesArrive() {
        when(clock.instant()).thenReturn(start);
        var outage = new DataAccessResourceFailureException("test outage");
        when(robots.findEnabledIds()).thenThrow(outage).thenReturn(Set.of("A")).thenThrow(outage);
        assertThat(registration.accepts("A")).isFalse();
        assertThat(registration.accepts("A")).isTrue();
        when(clock.instant()).thenReturn(start.plusSeconds(299));
        assertThat(registration.accepts("A")).isTrue();
        assertThat(registration.accepts("unknown")).isFalse();
        when(clock.instant()).thenReturn(start.plusSeconds(300));
        assertThat(registration.accepts("A")).isFalse();
    }

    @Test
    void successfulLookupReplacesDeletedOrDisabledRobots() {
        when(clock.instant()).thenReturn(start);
        when(robots.findEnabledIds()).thenReturn(Set.of("A")).thenReturn(Set.of("B"))
                .thenThrow(new DataAccessResourceFailureException("test outage"));
        assertThat(registration.accepts("A")).isTrue();
        assertThat(registration.accepts("A")).isFalse();
        assertThat(registration.accepts("A")).isFalse();
        assertThat(registration.accepts("B")).isTrue();
    }
}
