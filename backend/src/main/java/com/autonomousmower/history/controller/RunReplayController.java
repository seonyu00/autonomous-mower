package com.autonomousmower.history.controller;

import com.autonomousmower.history.repository.AutonomousRunRepository;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/history/runs")
public class RunReplayController {
    private final AutonomousRunRepository runs;
    private final Path directory;

    public RunReplayController(AutonomousRunRepository runs,
            @Value("${app.history.replay-directory:data/mission-replays}") String directory) {
        this.runs = runs;
        this.directory = Path.of(directory);
    }

    @GetMapping("/{id}/replay")
    @PreAuthorize("hasAuthority('history:read')")
    public ResponseEntity<FileSystemResource> replay(@PathVariable UUID id, @RequestParam String robotId) {
        var run = runs.findById(id);
        var file = directory.resolve(id + ".jsonl.gz");
        if (run.isEmpty() || !run.get().getRobotId().equals(robotId)
                || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_ENCODING, "gzip")
                .contentType(MediaType.APPLICATION_OCTET_STREAM).body(new FileSystemResource(file));
    }
}
