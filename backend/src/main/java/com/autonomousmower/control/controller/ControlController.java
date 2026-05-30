package com.autonomousmower.control.controller;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.control.dto.ChangeModeRequest;
import com.autonomousmower.control.dto.ClaimControlRequest;
import com.autonomousmower.control.dto.ControlCommandResponse;
import com.autonomousmower.control.dto.EmergencyStopRequest;
import com.autonomousmower.control.dto.ManualCommandRequest;
import com.autonomousmower.control.dto.MowerAttachmentCommandRequest;
import com.autonomousmower.control.dto.ReleaseControlRequest;
import com.autonomousmower.control.dto.ResetAfterEmergencyRequest;
import com.autonomousmower.control.dto.StopCommandRequest;
import com.autonomousmower.control.dto.TakeoverControlRequest;
import com.autonomousmower.control.service.ControlCommandService;
import com.autonomousmower.control.service.ControlLockService;
import com.autonomousmower.control.service.EmergencyStopService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/control/{robotId}")
public class ControlController {

    private final ControlLockService controlLockService;
    private final EmergencyStopService emergencyStopService;
    private final ControlCommandService controlCommandService;

    public ControlController(
            ControlLockService controlLockService,
            EmergencyStopService emergencyStopService,
            ControlCommandService controlCommandService
    ) {
        this.controlLockService = controlLockService;
        this.emergencyStopService = emergencyStopService;
        this.controlCommandService = controlCommandService;
    }

    @PostMapping("/claim")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<ControlCommandResponse> claim(
            @PathVariable String robotId,
            @Valid @RequestBody ClaimControlRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(controlLockService.claim(robotId, request, user));
    }

    @PostMapping("/release")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<ControlCommandResponse> release(
            @PathVariable String robotId,
            @Valid @RequestBody ReleaseControlRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(controlLockService.release(robotId, request, user));
    }

    @PostMapping("/takeover")
    @PreAuthorize("hasAuthority('control:takeover')")
    public ApiResponse<ControlCommandResponse> takeover(
            @PathVariable String robotId,
            @Valid @RequestBody TakeoverControlRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(controlLockService.takeover(robotId, request, user));
    }

    @PostMapping("/manual")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<ControlCommandResponse> manual(
            @PathVariable String robotId,
            @Valid @RequestBody ManualCommandRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(controlCommandService.manual(robotId, request, user));
    }

    @PostMapping("/mode")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<ControlCommandResponse> mode(
            @PathVariable String robotId,
            @Valid @RequestBody ChangeModeRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(controlCommandService.changeMode(robotId, request, user));
    }

    @PostMapping("/stop")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<ControlCommandResponse> stop(
            @PathVariable String robotId,
            @Valid @RequestBody StopCommandRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(controlCommandService.stop(robotId, request, user));
    }

    @PostMapping("/attachment")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<ControlCommandResponse> attachment(
            @PathVariable String robotId,
            @Valid @RequestBody MowerAttachmentCommandRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(controlCommandService.attachment(robotId, request, user));
    }

    @PostMapping("/estop")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<ControlCommandResponse> estop(
            @PathVariable String robotId,
            @Valid @RequestBody EmergencyStopRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(emergencyStopService.activate(robotId, request, user));
    }

    @PostMapping("/reset-after-emergency")
    @PreAuthorize("hasAuthority('control:write')")
    public ApiResponse<ControlCommandResponse> resetAfterEmergency(
            @PathVariable String robotId,
            @Valid @RequestBody ResetAfterEmergencyRequest request,
            @AuthenticationPrincipal SecurityUser user
    ) {
        return ApiResponse.success(emergencyStopService.reset(robotId, request, user));
    }
}
