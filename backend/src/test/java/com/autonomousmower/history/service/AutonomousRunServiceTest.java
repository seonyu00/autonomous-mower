package com.autonomousmower.history.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.autonomousmower.history.entity.AutonomousRun;
import com.autonomousmower.history.repository.AutonomousRunRepository;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.history.service.GpsDistanceCalculator.Sample;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class AutonomousRunServiceTest {
    final Instant start = Instant.parse("2026-11-07T00:00:00Z");
    final AutonomousRunRepository repo = mock(AutonomousRunRepository.class);
    final RobotService robots = mock(RobotService.class);
    final UUID id = UUID.randomUUID();
    final AutonomousRun run = new AutonomousRun(id, "test", start, start);

    AutonomousRunService service(long seconds) {
        when(repo.findByRobotIdOrderByStartedAtDesc("test")).thenReturn(List.of(run));
        when(repo.findById(id)).thenReturn(Optional.of(run));
        when(robots.getRobot("test")).thenReturn(new Robot("test", "test", LocalDateTime.now()));
        return new AutonomousRunService(repo, robots, Clock.fixed(start.plusSeconds(seconds), ZoneOffset.UTC));
    }

    @Test void thirtySecondBoundaryAndSameRunRecovery() {
        assertThat(service(29).find("test", null, null).getFirst().status()).isEqualTo("running");
        assertThat(service(30).find("test", null, null).getFirst().status()).isEqualTo("unconfirmed");
        service(31).observe("test", id, start.plusSeconds(31), start.plusSeconds(31), false);
        assertThat(service(31).find("test", null, null).getFirst().status()).isEqualTo("running");
        assertThat(run.getId()).isEqualTo(id);
    }
    @Test void replayDoesNotExtendLastObservationAndCompletionIsTerminal() {
        var s = service(40);
        s.observe("test", id, start, start.plusSeconds(40), false);
        assertThat(run.getLastObservedAt()).isEqualTo(start);
        s.observe("test", id, start.plusSeconds(2), start.plusSeconds(3), true);
        s.observe("test", id, start.plusSeconds(4), start.plusSeconds(5), false);
        assertThat(s.find("test", null, null).getFirst().status()).isEqualTo("completed");
        assertThat(run.getEndedAt()).isEqualTo(start.plusSeconds(2));
    }
    @Test void missingGpsStillReturnsRunAndNeverClaimsZeroDistance() {
        var r = service(0).find("test", null, null).getFirst();
        assertThat(r.routeSegments()).isEmpty();
        assertThat(r.distanceMeters()).isNull();
        assertThat(r.coveragePercent()).isNull();
    }
    @Test void gapCreatesSeparateSegmentsAndDoesNotAddConnectingDistance() {
        run.addPosition(new Sample(start, 0.0, 0.0));
        run.addPosition(new Sample(start.plusSeconds(1), 0.0, 0.001));
        run.addPosition(new Sample(start.plusSeconds(4), 0.0, 0.010));
        run.addPosition(new Sample(start.plusSeconds(5), 0.0, 0.011));
        var r = service(5).find("test", null, null).getFirst();
        assertThat(r.routeSegments()).hasSize(2);
        assertThat(r.hasGpsGap()).isTrue();
        assertThat(r.distanceMeters()).isBetween(222.0, 223.0);
    }
    @Test void nullGpsBreaksPathAndSamplesAreSortedAndDeduplicated() {
        var first = new Sample(start, 0.0, 0.0);
        run.addPosition(new Sample(start.plusSeconds(2), 0.0, 0.002));
        run.addPosition(first); run.addPosition(first);
        run.addPosition(new Sample(start.plusSeconds(1), null, null));
        var r = service(2).find("test", null, null).getFirst();
        assertThat(r.routeSegments()).hasSize(2);
        assertThat(r.distanceMeters()).isNull();
        assertThatThrownBy(() -> run.addPosition(new Sample(start, 1.0, 1.0)))
                .isInstanceOf(IllegalArgumentException.class);
    }
    @Test void conflictingRunIdentityAndCrossRobotAndUnstartedRunAreRejected() {
        var s = service(1);
        assertThatThrownBy(() -> s.start("test", id, start.plusSeconds(1), start.plusSeconds(1)))
                .isInstanceOf(IllegalArgumentException.class);
        when(repo.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> s.observe("test", id, start, start, false))
                .isInstanceOf(IllegalArgumentException.class);
    }
    @Test void closedRunOverlapsDateRangeButDoesNotAppearAfterEnd() {
        run.observe(start.plusSeconds(10), start.plusSeconds(10), true);
        assertThat(service(11).find("test", start.plusSeconds(9), start.plusSeconds(12))).hasSize(1);
        assertThat(service(11).find("test", start.plusSeconds(11), start.plusSeconds(12))).isEmpty();
        assertThatThrownBy(() -> run.addPosition(new Sample(start.plusSeconds(11), 0.0, 0.0)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void timestampsUseDatabasePrecisionForReplayIdentity() {
        var s = service(1);
        s.start("test", id, start.plusNanos(1), start.plusSeconds(1));
        run.addPosition(new Sample(start.plusNanos(1), 0.0, 0.0));
        run.addPosition(new Sample(start.plusNanos(2), 0.0, 0.0));
        assertThat(run.samples()).hasSize(1);
    }
}
