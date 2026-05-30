package com.autonomousmower.workzone.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.workzone.dto.SaveWorkZoneResponse;
import com.autonomousmower.workzone.dto.WorkZoneRequest;
import com.autonomousmower.workzone.dto.WorkZoneResponse;
import com.autonomousmower.workzone.service.WorkZoneService;
import jakarta.validation.Valid;
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
    @PreAuthorize("hasAuthority('robots:read')")
    public ApiResponse<WorkZoneResponse> getWorkZone(@PathVariable String robotId) {
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
}
