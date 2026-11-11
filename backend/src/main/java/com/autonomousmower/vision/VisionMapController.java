package com.autonomousmower.vision;

import com.autonomousmower.common.api.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/robots/{robotId}/vision-map")
public class VisionMapController {
    private final VisionMapService service;
    public VisionMapController(VisionMapService service) { this.service = service; }
    @GetMapping
    @PreAuthorize("hasAuthority('robots:read')")
    public ApiResponse<VisionMapService.Snapshot> get(@PathVariable String robotId,
            @RequestParam int version, @RequestParam(required = false) Long before) {
        return ApiResponse.success(service.snapshot(robotId, version, before));
    }
}
