package com.autonomousmower.logs.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.logs.dto.LogEntryResponse;
import com.autonomousmower.logs.service.LogService;
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
@RequestMapping("/api/logs")
public class LogController {

    private final LogService logService;

    public LogController(LogService logService) {
        this.logService = logService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('logs:read')")
    public ApiResponse<List<LogEntryResponse>> getLogs(
            @RequestParam(required = false) String robotId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false, defaultValue = "all") String severity
    ) {
        return ApiResponse.success(logService.findLogs(robotId, toUtcLocal(from), toUtcLocal(to), severity));
    }

    private LocalDateTime toUtcLocal(Instant instant) {
        return instant == null ? null : LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
