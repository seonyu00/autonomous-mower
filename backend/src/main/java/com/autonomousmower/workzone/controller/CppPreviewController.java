package com.autonomousmower.workzone.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.workzone.dto.CppPreviewRequest;
import com.autonomousmower.workzone.dto.CppPreviewResponse;
import com.autonomousmower.workzone.service.CppPreviewService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/robots/{robotId}/work-zone/cpp-preview")
public class CppPreviewController {
    private final CppPreviewService service;

    public CppPreviewController(CppPreviewService service) {
        this.service = service;
    }

    @PostMapping
    @PreAuthorize("hasAuthority('robots:read')")
    public ApiResponse<CppPreviewResponse> preview(
            @PathVariable String robotId, @Valid @RequestBody CppPreviewRequest request) {
        return ApiResponse.success(service.preview(robotId, request));
    }
}
