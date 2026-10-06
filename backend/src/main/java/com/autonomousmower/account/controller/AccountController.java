package com.autonomousmower.account.controller;

import com.autonomousmower.account.dto.AccountRequests;
import com.autonomousmower.account.dto.AccountResponses;
import com.autonomousmower.account.service.AccountService;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/accounts")
@Validated
public class AccountController {
    private final AccountService accounts;
    public AccountController(AccountService accounts) { this.accounts = accounts; }

    @GetMapping
    @PreAuthorize("hasAuthority('accounts:read')")
    public ApiResponse<AccountResponses.Page<AccountResponses.Account>> list(
            @RequestParam(defaultValue = "") @Size(max = 50) String search,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.success(accounts.list(search, page, size));
    }

    @GetMapping("/audit")
    @PreAuthorize("hasAuthority('accounts:read')")
    public ApiResponse<AccountResponses.Page<AccountResponses.Audit>> audit(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.success(accounts.audit(page, size));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('accounts:write')")
    public ApiResponse<AccountResponses.Account> create(@Valid @RequestBody AccountRequests.Create request,
                                                       @AuthenticationPrincipal SecurityUser user) {
        return ApiResponse.success(accounts.create(request, user));
    }

    @PreAuthorize("hasAuthority('accounts:read')")
    @GetMapping("/{adminId}")
    public ApiResponse<AccountResponses.Account> get(@PathVariable String adminId) {
        return ApiResponse.success(accounts.get(adminId));
    }

    @PatchMapping("/{adminId}")
    @PreAuthorize("hasAuthority('accounts:write')")
    public ApiResponse<AccountResponses.Account> update(@PathVariable String adminId, @Valid @RequestBody AccountRequests.Update request,
                                                       @AuthenticationPrincipal SecurityUser user) {
        return ApiResponse.success(accounts.update(adminId, request, user));
    }

    @PostMapping("/{adminId}/password-reset")
    @PreAuthorize("hasAuthority('accounts:write')")
    public ApiResponse<AccountResponses.Account> reset(@PathVariable String adminId, @Valid @RequestBody AccountRequests.ResetPassword request,
                                                      @AuthenticationPrincipal SecurityUser user) {
        return ApiResponse.success(accounts.resetPassword(adminId, request, user));
    }
}
