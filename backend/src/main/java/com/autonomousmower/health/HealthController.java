package com.autonomousmower.health;

import com.autonomousmower.common.api.ApiResponse;
import java.time.Instant;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    @GetMapping
    public ApiResponse<HealthResponse> health() {
        return ApiResponse.success(new HealthResponse("UP", "autonomous-mower-backend", Instant.now()));
    }

    public record HealthResponse(
            String status,
            String service,
            Instant timestamp
    ) {
    }
}
