package com.autonomousmower.workzone.controller;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.workzone.service.WorkZoneService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/robots/{robotId}/jetson-route/preview-run")
@ConditionalOnProperty(name = "app.jetson-route.preview-write-enabled", havingValue = "true")
public class JetsonPreviewRunController {
    public record Ticket(@NotNull UUID id, @Positive long zoneId, @Positive int zoneVersion, @Positive long lockVersion) {}
    private record Lease(Ticket ticket, String owner, Instant expiresAt) {}

    private final Map<String, Lease> leases = new HashMap<>();
    private final ControlStateStore controls;
    private final WorkZoneService zones;
    private final Clock clock;

    public JetsonPreviewRunController(ControlStateStore controls, WorkZoneService zones, Clock clock) {
        this.controls = controls;
        this.zones = zones;
        this.clock = clock;
    }

    @PostMapping("/start")
    @PreAuthorize("hasAuthority('control:write')")
    public synchronized ApiResponse<Ticket> start(@PathVariable String robotId, @Valid @RequestBody Ticket ticket,
                                                 @AuthenticationPrincipal SecurityUser user) {
        if (active(robotId) != null) throw new BusinessException(ErrorCode.JETSON_ROUTE_CONFLICT);
        requireCurrentZone(robotId, ticket);
        var lease = new Lease(ticket, user.getAdminId(), clock.instant().plusSeconds(5));
        if (!ownsControl(robotId, lease)) throw new BusinessException(ErrorCode.JETSON_ROUTE_CONFLICT);
        leases.put(robotId, lease);
        return ApiResponse.success(ticket);
    }

    @PostMapping("/{id}/renew")
    @PreAuthorize("hasAuthority('control:write')")
    public synchronized ResponseEntity<Void> renew(@PathVariable String robotId, @PathVariable UUID id,
                                                   @AuthenticationPrincipal SecurityUser user) {
        Lease lease = active(robotId);
        if (lease == null || !lease.ticket().id().equals(id) || !lease.owner().equals(user.getAdminId()))
            throw new BusinessException(ErrorCode.JETSON_ROUTE_CONFLICT);
        requireCurrentZone(robotId, lease.ticket());
        leases.put(robotId, new Lease(lease.ticket(), lease.owner(), clock.instant().plusSeconds(5)));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/stop")
    @PreAuthorize("hasAuthority('control:write')")
    public synchronized ResponseEntity<Void> stop(@PathVariable String robotId, @PathVariable UUID id,
                                                  @AuthenticationPrincipal SecurityUser user) {
        Lease lease = leases.get(robotId);
        if (lease != null && lease.ticket().id().equals(id) && lease.owner().equals(user.getAdminId())) leases.remove(robotId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('control:write','edge:work-zone:read')")
    public synchronized ResponseEntity<ApiResponse<Ticket>> current(@PathVariable String robotId, Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof com.autonomousmower.auth.security.EdgeWorkZonePrincipal edge
                && !edge.robotId().equals(robotId)) {
            throw new org.springframework.security.access.AccessDeniedException("Permission denied.");
        }
        Lease lease = active(robotId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(lease == null ? null : lease.ticket()));
    }

    private Lease active(String robotId) {
        Lease lease = leases.get(robotId);
        if (lease != null && (!clock.instant().isBefore(lease.expiresAt()) || !ownsControl(robotId, lease))) {
            leases.remove(robotId);
            return null;
        }
        return lease;
    }

    private boolean ownsControl(String robotId, Lease lease) {
        var state = controls.stateFor(robotId).snapshot();
        return "held".equals(state.lockState()) && lease.owner().equals(state.controlOwner())
                && state.lockVersion() == lease.ticket().lockVersion() && !state.emergency();
    }

    private void requireCurrentZone(String robotId, Ticket ticket) {
        var zone = zones.getWorkZone(robotId);
        if (!Long.valueOf(ticket.zoneId()).equals(zone.zoneId()) || ticket.zoneVersion() != zone.version())
            throw new BusinessException(ErrorCode.WORK_ZONE_CONFLICT);
    }
}
