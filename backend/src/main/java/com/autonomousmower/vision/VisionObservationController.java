package com.autonomousmower.vision;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.workzone.dto.WorkZonePayload;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/robots/{robotId}/vision-map/observations")
public class VisionObservationController {
    public enum ObjectType { PERSON, TREE_CANDIDATE, BUSH_CANDIDATE }
    public record Observation(@NotBlank @Size(max=128) String observationId,
                              @NotNull Instant observedAt, @NotNull ObjectType objectType,
                              Double longitude, Double latitude, WorkZonePayload area) {}
    public record Batch(@NotNull @Min(0) Integer version, @NotBlank @Size(max=64) String sessionId,
                        @NotEmpty @Size(max=20) List<@NotNull @Valid Observation> observations) {}
    public record Receipt(int accepted) {}
    private final VisionObservationService service;

    public VisionObservationController(VisionObservationService service) { this.service = service; }

    @PostMapping
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<Receipt> record(@PathVariable String robotId, @Valid @RequestBody Batch batch) {
        service.record(robotId, batch);
        return ApiResponse.success(new Receipt(batch.observations().size()));
    }
}
