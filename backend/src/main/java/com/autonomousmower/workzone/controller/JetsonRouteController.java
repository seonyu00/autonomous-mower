package com.autonomousmower.workzone.controller;

import com.autonomousmower.common.api.ApiResponse;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.workzone.service.JetsonRouteService;
import com.autonomousmower.workzone.service.JetsonRouteService.OpenSession;
import com.autonomousmower.workzone.service.JetsonRouteService.Report;
import com.autonomousmower.workzone.service.JetsonRouteService.Session;
import com.autonomousmower.workzone.service.JetsonRouteService.Snapshot;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Validator;
import java.io.IOException;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/robots/{robotId}/jetson-route")
public class JetsonRouteController {
    private static final int MAX_BODY_BYTES = 256 * 1024;
    private final JetsonRouteService routes;
    private final ObjectMapper json;
    private final Validator validator;
    private final boolean previewWriteEnabled;

    public JetsonRouteController(JetsonRouteService routes, ObjectMapper json, Validator validator,
                                @Value("${app.jetson-route.preview-write-enabled:false}") boolean previewWriteEnabled) {
        this.routes = routes;
        this.json = json;
        this.validator = validator;
        this.previewWriteEnabled = previewWriteEnabled;
    }

    @PostMapping(value = "/sessions", consumes = "application/json")
    @PreAuthorize("hasAnyAuthority('control:write','edge:work-zone:read')")
    public ApiResponse<Session> open(@PathVariable String robotId, Authentication authentication,
                                     HttpServletRequest request) {
        return ApiResponse.success(routes.open(robotId, actor(robotId, authentication), readPreview(request, OpenSession.class)));
    }

    @PutMapping(value = "/sessions/{sessionId}/latest", consumes = "application/json")
    @PreAuthorize("hasAnyAuthority('control:write','edge:work-zone:read')")
    public ApiResponse<Snapshot> report(@PathVariable String robotId, @PathVariable String sessionId,
                                       Authentication authentication, HttpServletRequest request) {
        UUID id;
        try {
            id = UUID.fromString(sessionId);
        } catch (IllegalArgumentException error) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return ApiResponse.success(routes.report(robotId, actor(robotId, authentication), id, readPreview(request, Report.class)));
    }

    @GetMapping("/latest")
    @PreAuthorize("hasAuthority('robots:read')")
    public ResponseEntity<ApiResponse<Snapshot>> latest(@PathVariable String robotId,
                                                       @RequestParam(required = false) String workZoneId,
                                                       @RequestParam(required = false) String workZoneVersion) {
        long zoneId;
        int version;
        try {
            zoneId = Long.parseLong(workZoneId);
            version = Integer.parseInt(workZoneVersion);
        } catch (NumberFormatException error) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        if (zoneId <= 0 || version <= 0) throw new BusinessException(ErrorCode.INVALID_REQUEST);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(routes.latest(robotId, zoneId, version)));
    }

    private <T> T readPreview(HttpServletRequest request, Class<T> type) {
        if (!previewWriteEnabled) throw new AccessDeniedException("Preview reporting is disabled");
        try {
            byte[] bytes = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
            if (bytes.length > MAX_BODY_BYTES) throw new BusinessException(ErrorCode.JETSON_ROUTE_TOO_LARGE);
            T body = json.readerFor(type)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS, DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                            DeserializationFeature.FAIL_ON_NUMBERS_FOR_ENUMS)
                    .readValue(bytes);
            if (body == null || !validator.validate(body).isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST);
            }
            return body;
        } catch (IOException error) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    private String actor(String robotId, Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof com.autonomousmower.auth.security.EdgeWorkZonePrincipal edge) {
            if (!edge.robotId().equals(robotId)) throw new AccessDeniedException("Permission denied");
            return "edge:" + edge.tokenId();
        }
        if (principal instanceof com.autonomousmower.auth.security.SecurityUser user) return user.getAdminId();
        throw new AccessDeniedException("Permission denied");
    }
}
