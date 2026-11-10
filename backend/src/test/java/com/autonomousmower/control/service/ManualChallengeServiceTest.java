package com.autonomousmower.control.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.service.MqttTopicResolver;
import com.autonomousmower.mqtt.transport.MqttTransport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ManualChallengeServiceTest {
    @Test
    void deliversMatchingResponseOnlyToCurrentLockOwner() throws Exception {
        var states = new ControlStateStore();
        var state = states.stateFor("robot");
        long version = state.claim("operator", "operator", "manual", Instant.now()).lockVersion();
        var mqtt = mock(MqttTransport.class);
        var mapper = new ObjectMapper().findAndRegisterModules();
        var service = new ManualChallengeService(mqtt, new MqttTopicResolver(), mapper, states);
        String token = "a".repeat(43);
        doAnswer(invocation -> {
            var message = mapper.readTree((byte[]) invocation.getArgument(1));
            String id = message.path("commandId").asText();
            service.receive("wrong-robot", id, "b".repeat(43));
            service.receive("robot", id, token);
            return null;
        }).when(mqtt).publish(anyString(), any(byte[].class), anyInt(), anyBoolean());
        assertThat(service.request("robot", "operator", version, Map.of("purpose", "rearm"))).isEqualTo(token);
        assertThatThrownBy(() -> service.request("robot", "other", version, Map.of("purpose", "rearm")));
    }

    @Test
    void refusesResponseWhenOwnershipChangesDuringWait() throws Exception {
        var states = new ControlStateStore();
        var state = states.stateFor("robot");
        long version = state.claim("operator", "operator", "manual", Instant.now()).lockVersion();
        var mqtt = mock(MqttTransport.class);
        var mapper = new ObjectMapper().findAndRegisterModules();
        var service = new ManualChallengeService(mqtt, new MqttTopicResolver(), mapper, states);
        doAnswer(invocation -> {
            var message = mapper.readTree((byte[]) invocation.getArgument(1));
            state.takeover("other", "other", "test", Instant.now());
            service.receive("robot", message.path("commandId").asText(), "a".repeat(43));
            return null;
        }).when(mqtt).publish(anyString(), any(byte[].class), anyInt(), anyBoolean());
        assertThatThrownBy(() -> service.request("robot", "operator", version, Map.of("purpose", "rearm")));
    }
}
