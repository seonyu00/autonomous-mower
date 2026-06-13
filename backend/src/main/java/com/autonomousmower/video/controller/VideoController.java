package com.autonomousmower.video.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.video.dto.VideoSessionRequest;
import com.autonomousmower.video.dto.VideoSessionResponse;
import com.autonomousmower.video.dto.VideoStopRequest;
import com.autonomousmower.video.dto.VideoStopResponse;
import com.autonomousmower.video.service.VideoSessionService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/video/{robotId}")
public class VideoController {

    private final VideoSessionService videoSessionService;

    public VideoController(VideoSessionService videoSessionService) {
        this.videoSessionService = videoSessionService;
    }

    @PostMapping("/offer")
    @PreAuthorize("hasAuthority('telemetry:read')")
    public ApiResponse<VideoSessionResponse> offer(
            @PathVariable String robotId,
            @Valid @RequestBody VideoSessionRequest request
    ) {
        return ApiResponse.success(videoSessionService.start(robotId, request));
    }

    @PostMapping("/stop")
    @PreAuthorize("hasAuthority('telemetry:read')")
    public ApiResponse<VideoStopResponse> stop(
            @PathVariable String robotId,
            @Valid @RequestBody VideoStopRequest request
    ) {
        return ApiResponse.success(videoSessionService.stop(robotId, request));
    }

    @PostMapping("/reconnect")
    @PreAuthorize("hasAuthority('telemetry:read')")
    public ApiResponse<VideoSessionResponse> reconnect(
            @PathVariable String robotId,
            @Valid @RequestBody VideoStopRequest request
    ) {
        return ApiResponse.success(videoSessionService.reconnect(robotId, request));
    }
}
