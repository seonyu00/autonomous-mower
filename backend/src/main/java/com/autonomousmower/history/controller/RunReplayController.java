package com.autonomousmower.history.controller;

import com.autonomousmower.auth.security.EdgeWorkZonePrincipal;
import com.autonomousmower.history.repository.AutonomousRunRepository;
import com.autonomousmower.history.dto.RunSignal;
import com.autonomousmower.history.service.RunSignalPersistence;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.UUID;
import java.time.Instant;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/history/runs")
public class RunReplayController {
    private final AutonomousRunRepository runs;
    private final Path directory;
    private final RunSignalPersistence signals;

    @Autowired
    public RunReplayController(AutonomousRunRepository runs, RunSignalPersistence signals,
            @Value("${app.history.replay-directory:data/mission-replays}") String directory) {
        this.runs = runs;
        this.directory = Path.of(directory);
        this.signals = signals;
    }

    public record Lifecycle(UUID id, String kind, Instant signalAt) {}

    @PutMapping(value = "/{id}/lifecycle", consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyAuthority('control:write','edge:mission:upload')")
    public ResponseEntity<Void> lifecycle(@PathVariable UUID id, @RequestParam String robotId,
            @RequestBody Lifecycle body, @AuthenticationPrincipal Object principal) throws IOException {
        if (principal instanceof EdgeWorkZonePrincipal edge && !edge.robotId().equals(robotId)) {
            return ResponseEntity.notFound().build();
        }
        Instant now = Instant.now();
        if (body.id() == null || body.kind() == null || !Set.of("start", "end").contains(body.kind())
                || body.signalAt() == null || body.signalAt().isAfter(now)
                || robotId.isBlank() || robotId.length() > 50) return ResponseEntity.badRequest().build();
        var run = runs.findById(id);
        if (run.isPresent() && !run.get().getRobotId().equals(robotId)) return ResponseEntity.notFound().build();
        if (body.kind().equals("end") && run.isEmpty()) return ResponseEntity.status(409).build();
        var signal = new RunSignal(body.id(), id, robotId, body.kind(), body.signalAt(), null, null);
        return signals.persist(signal, now) ? ResponseEntity.noContent().build() : ResponseEntity.status(409).build();
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

    @PutMapping(value = "/{id}/replay", consumes = "application/gzip")
    @PreAuthorize("hasAnyAuthority('control:write','edge:mission:upload')")
    public ResponseEntity<Void> upload(@PathVariable UUID id, @RequestParam String robotId,
            HttpServletRequest request, @AuthenticationPrincipal Object principal) throws IOException {
        if (principal instanceof EdgeWorkZonePrincipal edge && !edge.robotId().equals(robotId)) {
            return ResponseEntity.notFound().build();
        }
        var run = runs.findById(id).filter(item -> item.getRobotId().equals(robotId));
        if (run.isEmpty()) return ResponseEntity.notFound().build();
        if (run.get().getEndedAt() == null) return ResponseEntity.status(409).build();

        int limit = 16 * 1024 * 1024;
        byte[] bytes = request.getInputStream().readNBytes(limit + 1);
        if (bytes.length > limit) return ResponseEntity.status(413).build();
        if (!RunReplayUpload.valid(bytes, id)) return ResponseEntity.badRequest().build();
        Files.createDirectories(directory);
        var staged = Files.createTempFile(directory, ".upload-", ".gz");
        try {
            Files.write(staged, bytes);
            var target = directory.resolve(id + ".jsonl.gz");
            try {
                Files.createLink(target, staged);
            } catch (FileAlreadyExistsException exists) {
                if (!Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS) || Files.mismatch(staged, target) != -1) {
                    return ResponseEntity.status(409).build();
                }
            }
            return ResponseEntity.noContent().build();
        } finally {
            Files.deleteIfExists(staged);
        }
    }
}
