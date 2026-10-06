package com.autonomousmower.auth.security;

import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public class SecurityUser implements UserDetails {

    private final String adminId;
    private final String displayName;
    private final RoleName roleName;
    private final List<GrantedAuthority> authorities;
    private final long sessionVersion;
    private final boolean mustChangePassword;

    private SecurityUser(String adminId, String displayName, RoleName roleName, long sessionVersion, boolean mustChangePassword) {
        this.adminId = adminId;
        this.displayName = displayName;
        this.roleName = roleName;
        this.sessionVersion = sessionVersion;
        this.mustChangePassword = mustChangePassword;
        this.authorities = (mustChangePassword ? List.<Permission>of() : roleName.getPermissions()).stream()
                .map(Permission::getValue)
                .map(SimpleGrantedAuthority::new)
                .map(GrantedAuthority.class::cast)
                .toList();
    }

    public static SecurityUser from(String adminId, String displayName, RoleName roleName) {
        return new SecurityUser(adminId, displayName, roleName, 0, false);
    }

    public static SecurityUser from(String adminId, RoleName roleName, long sessionVersion, boolean mustChangePassword) {
        return new SecurityUser(adminId, adminId, roleName, sessionVersion, mustChangePassword);
    }

    public long getSessionVersion() { return sessionVersion; }
    public boolean isMustChangePassword() { return mustChangePassword; }

    public String getAdminId() {
        return adminId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getRoleName() {
        return roleName.getValue();
    }

    public List<String> getPermissionValues() {
        return (mustChangePassword ? List.<Permission>of() : roleName.getPermissions()).stream()
                .map(Permission::getValue)
                .toList();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return "";
    }

    @Override
    public String getUsername() {
        return adminId;
    }
}
