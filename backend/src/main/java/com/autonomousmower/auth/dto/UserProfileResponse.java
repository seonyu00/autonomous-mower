package com.autonomousmower.auth.dto;

import com.autonomousmower.auth.security.SecurityUser;
import java.util.List;

public record UserProfileResponse(
        String id,
        String name,
        String role,
        List<String> permissions
) {
    public static UserProfileResponse from(SecurityUser user) {
        return new UserProfileResponse(
                user.getAdminId(),
                user.getDisplayName(),
                user.getRoleName(),
                user.getPermissionValues()
        );
    }
}
