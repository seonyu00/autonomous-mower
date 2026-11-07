package com.autonomousmower.workzone.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.workzone.dto.CppPreviewRequest;
import com.autonomousmower.workzone.dto.CppPreviewResponse;
import com.autonomousmower.workzone.service.CppPreviewService;
import com.autonomousmower.workzone.service.RoutePlanService;
import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/robots/{robotId}/work-zone/cpp-preview")
public class CppPreviewController {
    private final CppPreviewService service;
    private final RoutePlanService plans;

    public CppPreviewController(CppPreviewService service, RoutePlanService plans) {
        this.service = service;
        this.plans = plans;
    }

    @PostMapping
    @PreAuthorize("hasAuthority('robots:read')")
    public ApiResponse<CppPreviewResponse> preview(
            @PathVariable String robotId, @Valid @RequestBody CppPreviewRequest request) {
        return ApiResponse.success(service.preview(robotId, request));
    }

    @PostMapping("/plans")
    @PreAuthorize("hasAuthority('robots:read')")
    public ApiResponse<RoutePlanService.Generated> generatePlan(
            @PathVariable String robotId, @Valid @RequestBody CppPreviewRequest request) {
        return ApiResponse.success(plans.generate(robotId, request));
    }

    @GetMapping("/plans/{planId}")
    @PreAuthorize("hasAuthority('robots:read')")
    public ApiResponse<RoutePlanService.Envelope> getPlan(@PathVariable String robotId, @PathVariable UUID planId) {
        return ApiResponse.success(plans.get(robotId, planId));
    }
}
