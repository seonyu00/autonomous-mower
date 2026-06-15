package com.autonomousmower.logs.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.logs.dto.SaveSnapshotResponse;
import com.autonomousmower.logs.model.SnapshotContent;
import com.autonomousmower.logs.service.SnapshotService;
import java.time.Instant;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class SnapshotController {

    private final SnapshotService snapshotService;

    public SnapshotController(SnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    @PostMapping(
            path = "/api/robots/{robotId}/snapshots",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    @PreAuthorize("hasAuthority('telemetry:read')")
    public ApiResponse<SaveSnapshotResponse> upload(
            @PathVariable String robotId,
            @RequestParam MultipartFile file,
            @RequestParam String captureType,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant capturedAt
    ) {
        return ApiResponse.success(snapshotService.save(robotId, captureType, capturedAt, file));
    }

    @GetMapping("/api/logs/snapshots/{snapshotId}")
    @PreAuthorize("hasAuthority('logs:read')")
    public ResponseEntity<byte[]> download(@PathVariable String snapshotId) {
        SnapshotContent snapshot = snapshotService.load(snapshotId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType(snapshot.contentType()))
                .body(snapshot.content());
    }
}
