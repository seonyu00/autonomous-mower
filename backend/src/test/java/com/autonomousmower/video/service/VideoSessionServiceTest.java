package com.autonomousmower.video.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import com.autonomousmower.realtime.service.RealtimePublisher;
import com.autonomousmower.robot.service.RobotService;
import com.autonomousmower.video.dto.VideoSessionRequest;
import com.autonomousmower.video.dto.VideoSessionResponse;
import com.autonomousmower.video.dto.VideoStopRequest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class VideoSessionServiceTest {

    @Mock
    private RobotService robotService;

    @Mock
    private RealtimePublisher realtimePublisher;

    private VideoSessionService service;

    @BeforeEach
    void setUp() {
        service = new VideoSessionService(
                robotService,
                realtimePublisher,
                "http://100.92.7.56:8889",
                Clock.fixed(
                        Instant.parse("2026-06-13T08:00:00Z"),
                        ZoneOffset.UTC
                )
        );
    }

    @Test
    void startBuildsRobotSpecificWhepUrlAndPublishesStatus() {
        VideoSessionResponse response = service.start(
                "MOWER-01",
                new VideoSessionRequest("MOWER-01", 640, 480, 15, 500)
        );

        assertThat(response.whepUrl()).isEqualTo(
                "http://100.92.7.56:8889/mowers/MOWER-01/whep"
        );
        assertThat(response.state()).isEqualTo("connecting");
        verify(robotService).getRobot("MOWER-01");
        verify(realtimePublisher).publishVideoStatus(
                org.mockito.ArgumentMatchers.any()
        );
    }

    @Test
    void reconnectCreatesANewSessionAfterStoppingThePreviousOne() {
        VideoSessionResponse first = service.start(
                "MOWER-01",
                new VideoSessionRequest("MOWER-01", 640, 480, 15, 500)
        );

        VideoSessionResponse second = service.reconnect(
                "MOWER-01",
                new VideoStopRequest("MOWER-01", first.sessionId())
        );

        assertThat(second.sessionId()).isNotEqualTo(first.sessionId());
        assertThat(second.whepUrl()).isEqualTo(first.whepUrl());
    }
}
