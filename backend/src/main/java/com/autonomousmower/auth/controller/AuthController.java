package com.autonomousmower.auth.controller;

import com.autonomousmower.auth.dto.LoginRequest;
import com.autonomousmower.auth.dto.LoginResponse;
import com.autonomousmower.auth.dto.UserProfileResponse;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.auth.service.AuthService;
import com.autonomousmower.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success(authService.login(request));
    }

    @GetMapping("/me")
    public ApiResponse<UserProfileResponse> me(@AuthenticationPrincipal SecurityUser user) {
        return ApiResponse.success(UserProfileResponse.from(user));
    }
}
