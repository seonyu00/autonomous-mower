package com.autonomousmower.auth.service;

import com.autonomousmower.auth.dto.LoginRequest;
import com.autonomousmower.auth.dto.LoginResponse;
import com.autonomousmower.auth.dto.UserProfileResponse;
import com.autonomousmower.auth.entity.Admin;
import com.autonomousmower.auth.repository.AdminRepository;
import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.RoleName;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthService(
            AdminRepository adminRepository,
            PasswordEncoder passwordEncoder,
            JwtTokenProvider jwtTokenProvider
    ) {
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        Admin admin = adminRepository.findById(request.adminId())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));

        if (!passwordEncoder.matches(request.password(), admin.getPasswordHash())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        RoleName roleName = RoleName.fromValue(admin.getRole());
        SecurityUser user = SecurityUser.from(admin.getAdminId(), admin.getAdminId(), roleName);
        JwtTokenProvider.TokenResult tokenResult = jwtTokenProvider.createToken(user);
        return new LoginResponse(
                tokenResult.token(),
                "Bearer",
                tokenResult.expiresAt(),
                UserProfileResponse.from(user)
        );
    }
}
