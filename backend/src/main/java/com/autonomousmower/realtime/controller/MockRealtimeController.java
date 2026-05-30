package com.autonomousmower.realtime.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.realtime.dto.TelemetryMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Profile("test")
@RestController
@RequestMapping("/api/test/realtime/robots/{robotId}")
public class MockRealtimeController {

    private final RealtimePublisher realtimePublisher;

    public MockRealtimeController(RealtimePublisher realtimePublisher) {
        this.realtimePublisher = realtimePublisher;
    }

    @PostMapping("/telemetry")
    @PreAuthorize("hasAuthority('telemetry:read')")
    public ApiResponse<TelemetryMessage> publishTelemetry(
            @PathVariable String robotId,
            @Valid @RequestBody TelemetryMessage message
    ) {
        if (!robotId.equals(message.robotId())) {
            throw new IllegalArgumentException("Path robotId must match payload robotId.");
        }
        realtimePublisher.publishTelemetry(message);
        return ApiResponse.success(message);
    }
}
