package com.autonomousmower.history.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import com.autonomousmower.history.entity.AutonomousRun;
import com.autonomousmower.history.repository.AutonomousRunRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RunReplayControllerTest {
    @Test void onlyServesAnArchiveForTheMatchingRobotAndRun(@TempDir Path dir) throws Exception {
        var id = UUID.randomUUID();
        var runs = mock(AutonomousRunRepository.class);
        var run = new AutonomousRun(id, "robot", Instant.EPOCH, Instant.EPOCH);
        when(runs.findById(id)).thenReturn(Optional.of(run));
        var controller = new RunReplayController(runs, mock(com.autonomousmower.history.service.RunSignalPersistence.class), dir.toString());
        assertThat(controller.replay(id, "robot").getStatusCode().value()).isEqualTo(404);
        Files.write(dir.resolve(id + ".jsonl.gz"), new byte[]{1, 2, 3});
        assertThat(controller.replay(id, "other").getStatusCode().value()).isEqualTo(404);
        assertThat(controller.replay(UUID.randomUUID(), "robot").getStatusCode().value()).isEqualTo(404);
        var response = controller.replay(id, "robot");
        assertThat(response.getHeaders().getFirst("Content-Encoding")).isEqualTo("gzip");
        assertThat(response.getBody().getContentAsByteArray()).containsExactly(1, 2, 3);
    }
}
