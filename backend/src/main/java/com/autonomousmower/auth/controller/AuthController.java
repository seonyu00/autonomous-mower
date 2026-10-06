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
import org.springframework.web.bind.annotation.PutMapping;
import com.autonomousmower.account.service.AccountService;
import com.autonomousmower.account.dto.AccountRequests;
import com.autonomousmower.account.dto.AccountResponses;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final AccountService accounts;

    public AuthController(AuthService authService, AccountService accounts) {
        this.authService = authService;
        this.accounts = accounts;
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success(authService.login(request));
    }

    @GetMapping("/me")
    public ApiResponse<UserProfileResponse> me(@AuthenticationPrincipal SecurityUser user) {
        return ApiResponse.success(UserProfileResponse.from(user));
    }

    @PutMapping("/password")
    public ApiResponse<AccountResponses.PasswordChanged> changePassword(@Valid @RequestBody AccountRequests.ChangePassword request,
                                                                      @AuthenticationPrincipal SecurityUser user) {
        return ApiResponse.success(accounts.changePassword(request, user));
    }
}
