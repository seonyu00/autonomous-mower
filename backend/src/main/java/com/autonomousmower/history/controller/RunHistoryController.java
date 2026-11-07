package com.autonomousmower.history.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.history.dto.RunHistoryResponse;
import com.autonomousmower.history.service.AutonomousRunService;
import java.time.Instant;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/history/runs")
public class RunHistoryController {
    private final AutonomousRunService service;
    public RunHistoryController(AutonomousRunService service) { this.service = service; }
    @GetMapping
    @PreAuthorize("hasAuthority('history:read')")
    public ApiResponse<List<RunHistoryResponse>> find(@RequestParam String robotId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        if (from != null && to != null && from.isAfter(to))
            throw new com.autonomousmower.common.exception.BusinessException(
                    com.autonomousmower.common.exception.ErrorCode.INVALID_REQUEST);
        return ApiResponse.success(service.find(robotId, from, to));
    }
}
