package com.autonomousmower.account.dto;

import jakarta.validation.constraints.*;

public final class AccountRequests {
    private AccountRequests() {}

    public record Create(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9._-]{1,20}") String adminId,
            @NotBlank @Pattern(regexp = "read-only|operator|supervisor|admin") String role,
            @NotBlank @Size(max = 4096) String temporaryPassword) {}

    public record Update(
            @NotBlank @Pattern(regexp = "read-only|operator|supervisor|admin") String role,
            @NotNull Boolean enabled,
            @NotNull @Min(0) Long expectedVersion) {}

    public record ResetPassword(
            @NotBlank @Size(max = 4096) String temporaryPassword,
            @NotBlank @Size(max = 4096) String currentPassword,
            @NotNull @Min(0) Long expectedVersion) {}

    public record ChangePassword(
            @NotBlank @Size(max = 4096) String currentPassword,
            @NotBlank @Size(max = 4096) String newPassword) {}
}
