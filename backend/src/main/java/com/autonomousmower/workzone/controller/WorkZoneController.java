package com.autonomousmower.workzone.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.workzone.dto.SaveWorkZoneResponse;
import com.autonomousmower.workzone.dto.WorkZoneRequest;
import com.autonomousmower.workzone.dto.WorkZoneResponse;
import com.autonomousmower.workzone.service.WorkZoneService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/robots/{robotId}/work-zone")
public class WorkZoneController {

    private final WorkZoneService workZoneService;

    public WorkZoneController(WorkZoneService workZoneService) {
        this.workZoneService = workZoneService;
    }

    @GetMapping
    public ApiResponse<WorkZoneResponse> getWorkZone(@PathVariable String robotId, Authentication authentication) {
        Object principal = authentication.getPrincipal();
        boolean edgeOwnsRobot = principal instanceof com.autonomousmower.auth.security.EdgeWorkZonePrincipal edge
                && !edge.missionUpload() && edge.robotId().equals(robotId);
        boolean operatorCanRead = authentication.getAuthorities().stream()
                .anyMatch(authority -> "robots:read".equals(authority.getAuthority()));
        if (!edgeOwnsRobot && !operatorCanRead) throw new org.springframework.security.access.AccessDeniedException("Permission denied.");
        return ApiResponse.success(workZoneService.getWorkZone(robotId));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<SaveWorkZoneResponse> saveWorkZone(
            @PathVariable String robotId,
            @Valid @RequestBody WorkZoneRequest request
    ) {
        return ApiResponse.success(workZoneService.saveWorkZone(robotId, request));
    }

    @PutMapping("/travel-zone")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<SaveWorkZoneResponse> saveTravelZone(@PathVariable String robotId, @Valid @RequestBody WorkZoneRequest request) {
        return ApiResponse.success(workZoneService.saveTravelZone(robotId, request));
    }
}
