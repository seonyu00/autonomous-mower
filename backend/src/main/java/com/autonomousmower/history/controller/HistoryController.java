package com.autonomousmower.history.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.history.dto.RobotHistoryResponse;
import com.autonomousmower.history.service.HistoryService;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/history")
public class HistoryController {

    private final HistoryService historyService;

    public HistoryController(HistoryService historyService) {
        this.historyService = historyService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('history:read')")
    public ApiResponse<List<RobotHistoryResponse>> getHistory(
            @RequestParam String robotId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to
    ) {
        return ApiResponse.success(historyService.findHistory(robotId, toUtcLocal(from), toUtcLocal(to)));
    }

    private LocalDateTime toUtcLocal(Instant instant) {
        return instant == null ? null : LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
