package com.autonomousmower.control.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.autonomousmower.auth.security.RoleName;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import com.autonomousmower.control.dto.*;
import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.service.MqttCommandPublisher;
import com.autonomousmower.realtime.service.RealtimePublisher;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ControlLockVersionTest {
    final SecurityUser owner = SecurityUser.from("owner", "Owner", RoleName.ADMIN);
    final ControlStateStore store = new ControlStateStore();
    final MqttCommandPublisher mqtt = mock(MqttCommandPublisher.class);
    final ControlRobotGuard guard = mock(ControlRobotGuard.class);
    ControlCommandService commands;
    ControlLockService locks;
    long version;

    @BeforeEach
    void setUp() {
        var realtime = mock(RealtimePublisher.class);
        var events = new ControlEventPublisher(realtime);
        var responses = new ControlResponseFactory();
        commands = new ControlCommandService(store, new DeadmanService(store, mqtt), responses, mqtt, guard);
        locks = new ControlLockService(store, realtime, responses, events, guard,
                new com.autonomousmower.auth.security.AccountSessionCoordinator(),
                mock(com.autonomousmower.auth.security.JwtTokenProvider.class));
        version = locks.claim("A", new ClaimControlRequest("claim", "manual"), owner).lockVersion();
    }

    @Test
    void staleVersionsNeverReachTransportOrReleaseOwnership() {
        assertConflict(() -> commands.manual("A", manual(0), owner));
        assertConflict(() -> commands.stop("A", new StopCommandRequest("stop", "A", "stop", 0, "stop-key", 0, "test"), owner));
        assertConflict(() -> commands.changeMode("A", new ChangeModeRequest("change-mode", "A", "manual", "mode", 0), owner));
        assertConflict(() -> commands.attachment("A", new MowerAttachmentCommandRequest("mower-attachment", "A", "raise", "attachment", 0), owner));
        assertConflict(() -> locks.release("A", new ReleaseControlRequest("release", 0), owner));
        assertThat(store.stateFor("A").snapshot().lockVersion()).isEqualTo(version);
        verifyNoInteractions(mqtt);
    }

    @Test
    void acceptedCommandAndTransportUseTheSameRobotMonitorAndVersion() {
        doAnswer(call -> {
            assertThat(Thread.holdsLock(store.stateFor("A"))).isTrue();
            return null;
        }).when(mqtt).publishManualCommand(any());
        var result = commands.manual("A", manual(version), owner);
        assertThat(result.lockVersion()).isEqualTo(version);
        verify(mqtt).publishManualCommand(argThat(payload -> payload.lockVersion() == version));
    }

    @Test
    void takeoverThatWinsBeforeAdmissionRejectsAnAlreadyArrivingOldCommand() throws Exception {
        var arrived = new CountDownLatch(1);
        var resume = new CountDownLatch(1);
        doAnswer(call -> {
            if (Thread.currentThread().getName().equals("old-command")) {
                arrived.countDown();
                assertThat(resume.await(5, TimeUnit.SECONDS)).isTrue();
            }
            return null;
        }).when(guard).requireKnownRobot("A");
        try (var executor = Executors.newSingleThreadExecutor(r -> new Thread(r, "old-command"))) {
            var old = executor.submit(() -> {
                assertConflict(() -> commands.manual("A", manual(version), owner));
            });
            try {
                assertThat(arrived.await(5, TimeUnit.SECONDS)).isTrue();
                // 같은 사용자에게 다시 인수해도 이전 세대 명령은 거부해야 한다.
                locks.takeover("A", new TakeoverControlRequest("takeover", "test"), owner);
            } finally {
                resume.countDown();
            }
            old.get(5, TimeUnit.SECONDS);
        }
        verifyNoInteractions(mqtt);
    }

    @Test
    void aCommandCannotPublishAfterAnotherThreadTakesItsOwnership() {
        var other = SecurityUser.from("other", "Other", RoleName.ADMIN);
        locks.takeover("A", new TakeoverControlRequest("takeover", "test"), other);
        assertThatThrownBy(() -> commands.manual("A", manual(version), owner)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(mqtt);
    }

    private ManualCommandRequest manual(long expectedVersion) {
        return new ManualCommandRequest("manual", "A", "forward", 0.5, "manual", expectedVersion, Instant.now());
    }

    private void assertConflict(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CONTROL_VERSION_CONFLICT);
    }
}
