package com.autonomousmower.control.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import com.autonomousmower.control.entity.CommandExecutionStatus;
import com.autonomousmower.control.repository.CommandExecutionRepository;
import com.autonomousmower.mqtt.dto.MqttCommandAckPayload;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.realtime.dto.ControlEventMessage;
import com.autonomousmower.realtime.service.RealtimePublisher;
import com.autonomousmower.robot.entity.Robot;
import com.autonomousmower.robot.repository.RobotRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({CommandExecutionService.class, CommandExecutionConcurrencyTest.TimeConfiguration.class})
@EnabledIfEnvironmentVariable(named = "WORK_ZONE_TEST_JDBC_URL",
        matches = "jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/mower_workzone_test")
class CommandExecutionConcurrencyTest {
    @Autowired CommandExecutionService service;
    @Autowired CommandExecutionRepository commands;
    @Autowired RobotRepository robots;
    @MockBean RealtimePublisher realtime;
    String robotId;
    String commandId;

    @TestConfiguration
    static class TimeConfiguration {
        @Bean Clock clock() { return Clock.systemUTC(); }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("WORK_ZONE_TEST_JDBC_URL"));
        properties.add("spring.datasource.username", () -> System.getenv("WORK_ZONE_TEST_DB_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("WORK_ZONE_TEST_DB_PASSWORD"));
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @BeforeEach
    void registerCommittedCommand() {
        robotId = "ack-" + UUID.randomUUID();
        commandId = "ack-" + UUID.randomUUID();
        robots.saveAndFlush(new Robot(robotId, "PC ACK 경쟁 검증", LocalDateTime.now()));
        service.register(new MqttCommandPayload(commandId, robotId, "stop", commandId,
                null, null, "pc-test", Instant.now(), "stop", Map.of("speed", 0)));
    }

    @AfterEach
    void removeOwnFixtures() {
        commands.deleteById(commandId);
        robots.deleteById(robotId);
    }

    @Test
    void sentUpdateWaitsForAckTransactionAndDoesNotOverwriteIt() throws Exception {
        CountDownLatch ackHoldsRow = new CountDownLatch(1);
        CountDownLatch releaseAck = new CountDownLatch(1);
        doAnswer(invocation -> {
            ControlEventMessage event = invocation.getArgument(0);
            if ("edge-ack".equals(event.status())) {
                ackHoldsRow.countDown();
                assertThat(releaseAck.await(5, TimeUnit.SECONDS)).isTrue();
            }
            return null;
        }).when(realtime).publishControlEvent(any());
        try (var executor = Executors.newFixedThreadPool(2)) {
            var ack = executor.submit(() -> service.applyAck(ack("accepted")));
            assertThat(ackHoldsRow.await(5, TimeUnit.SECONDS)).isTrue();
            var sent = executor.submit(() -> service.markSent(commandId));
            try {
                assertThatThrownBy(() -> sent.get(150, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            } finally {
                releaseAck.countDown();
            }
            ack.get(5, TimeUnit.SECONDS);
            sent.get(5, TimeUnit.SECONDS);
        } finally {
            releaseAck.countDown();
        }
        assertThat(commands.findById(commandId).orElseThrow().getStatus()).isEqualTo(CommandExecutionStatus.ACKED);
    }

    @Test
    void concurrentAcceptedAndCompletedKeepCompleted() throws Exception {
        service.markSent(commandId);
        CyclicBarrier start = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { start.await(5, TimeUnit.SECONDS); return service.applyAck(ack("accepted")); });
            var second = executor.submit(() -> { start.await(5, TimeUnit.SECONDS); return service.applyAck(ack("completed")); });
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
        }
        var command = commands.findById(commandId).orElseThrow();
        assertThat(command.getStatus()).isEqualTo(CommandExecutionStatus.COMPLETED);
        assertThat(command.getCompletedAt()).isNotNull();
    }

    private MqttCommandAckPayload ack(String status) {
        return new MqttCommandAckPayload(commandId, robotId, "stop", status, null,
                "pc-test", Instant.now(), Instant.now());
    }
}
