package com.autonomousmower.video.service;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.realtime.dto.VideoStatusMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.video.dto.VideoSessionRequest;
import com.autonomousmower.video.dto.VideoSessionResponse;
import com.autonomousmower.video.dto.VideoStopRequest;
import com.autonomousmower.video.dto.VideoStopResponse;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class VideoSessionService {

    private static final int DEFAULT_WIDTH = 640;
    private static final int DEFAULT_HEIGHT = 480;
    private static final int DEFAULT_FPS = 15;
    private static final int DEFAULT_BITRATE_KBPS = 500;

    private final RobotService robotService;
    private final RealtimePublisher realtimePublisher;
    private final String whepBaseUrl;
    private final Clock clock;
    private final Map<String, VideoSessionRequest> sessionRequests = new ConcurrentHashMap<>();

    public VideoSessionService(
            RobotService robotService,
            RealtimePublisher realtimePublisher,
            @Value("${video.whep-base-url:http://100.92.7.56:8889}") String whepBaseUrl,
            Clock clock
    ) {
        this.robotService = robotService;
        this.realtimePublisher = realtimePublisher;
        this.whepBaseUrl = stripTrailingSlash(whepBaseUrl);
        this.clock = clock;
    }

    public VideoSessionResponse start(String robotId, VideoSessionRequest request) {
        validateRobotId(robotId, request.robotId());
        robotService.getRobot(robotId);

        String sessionId = UUID.randomUUID().toString();
        Instant now = clock.instant();
        sessionRequests.put(sessionId, request);

        VideoSessionResponse response = new VideoSessionResponse(
                sessionId,
                robotId,
                whepBaseUrl + "/mowers/" + robotId + "/whep",
                "connecting",
                now
        );
        publishStatus(robotId, sessionId, "connecting", request, now);
        return response;
    }

    public VideoStopResponse stop(String robotId, VideoStopRequest request) {
        validateRobotId(robotId, request.robotId());
        robotService.getRobot(robotId);

        VideoSessionRequest previous = sessionRequests.remove(request.sessionId());
        Instant now = clock.instant();
        publishStatus(
                robotId,
                request.sessionId(),
                "disconnected",
                previous != null ? previous : defaultRequest(robotId),
                now
        );
        return new VideoStopResponse(true, robotId, request.sessionId(), now);
    }

    public VideoSessionResponse reconnect(String robotId, VideoStopRequest request) {
        validateRobotId(robotId, request.robotId());
        VideoSessionRequest previous = sessionRequests.getOrDefault(
                request.sessionId(),
                defaultRequest(robotId)
        );
        stop(robotId, request);
        return start(robotId, previous);
    }

    private void validateRobotId(String pathRobotId, String bodyRobotId) {
        if (!pathRobotId.equals(bodyRobotId)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    private void publishStatus(
            String robotId,
            String sessionId,
            String state,
            VideoSessionRequest request,
            Instant now
    ) {
        realtimePublisher.publishVideoStatus(new VideoStatusMessage(
                robotId,
                sessionId,
                state,
                request.fps(),
                request.width(),
                request.height(),
                request.maxBitrateKbps(),
                "H264",
                null,
                now
        ));
    }

    private VideoSessionRequest defaultRequest(String robotId) {
        return new VideoSessionRequest(
                robotId,
                DEFAULT_WIDTH,
                DEFAULT_HEIGHT,
                DEFAULT_FPS,
                DEFAULT_BITRATE_KBPS
        );
    }

    private static String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
