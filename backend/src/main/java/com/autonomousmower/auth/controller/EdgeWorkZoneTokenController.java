package com.autonomousmower.auth.controller;

import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.auth.service.EdgeWorkZoneTokenService;
import com.autonomousmower.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/robots/{robotId}/edge-work-zone-tokens")
public class EdgeWorkZoneTokenController {
    private final EdgeWorkZoneTokenService tokens;
    public EdgeWorkZoneTokenController(EdgeWorkZoneTokenService tokens) { this.tokens = tokens; }

    @PostMapping
    @PreAuthorize("hasAuthority('accounts:write')")
    public ApiResponse<IssuedResponse> issue(@PathVariable String robotId, @Valid @RequestBody IssueRequest request,
                                              @AuthenticationPrincipal SecurityUser user) {
        var issued = tokens.issue(robotId, request.label(), user.getAdminId());
        return ApiResponse.success(new IssuedResponse(issued.tokenId(), issued.token(), issued.expiresAt()));
    }

    @DeleteMapping("/{tokenId}")
    @PreAuthorize("hasAuthority('accounts:write')")
    public ApiResponse<Void> revoke(@PathVariable String robotId, @PathVariable UUID tokenId) {
        tokens.revoke(robotId, tokenId);
        return ApiResponse.success(null);
    }

    public record IssueRequest(@NotBlank String label) { }
    public record IssuedResponse(UUID tokenId, String token, Instant expiresAt) { }
}
