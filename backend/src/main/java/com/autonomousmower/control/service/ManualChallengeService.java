package com.autonomousmower.control.service;

import com.autonomousmower.control.model.ControlStateStore;
import com.autonomousmower.mqtt.dto.MqttCommandPayload;
import com.autonomousmower.mqtt.service.MqttTopicResolver;
import com.autonomousmower.mqtt.transport.MqttTransport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ManualChallengeService {
    private record Waiting(String robotId, CompletableFuture<String> result) {}
    private final ConcurrentHashMap<String, Waiting> waiting = new ConcurrentHashMap<>();
    private final MqttTransport transport;
    private final MqttTopicResolver topics;
    private final ObjectMapper mapper;
    private final ControlStateStore states;

    public ManualChallengeService(MqttTransport transport, MqttTopicResolver topics, ObjectMapper mapper, ControlStateStore states) {
        this.transport = transport;
        this.topics = topics;
        this.mapper = mapper;
        this.states = states;
    }

    public String request(String robotId, String operator, long version, Map<String, Object> parameters) {
        var state = states.stateFor(robotId);
        Object purpose = parameters.get("purpose");
        boolean rearm = "rearm".equals(purpose) && parameters.keySet().equals(java.util.Set.of("purpose"));
        boolean movement = "movement".equals(purpose)
                && parameters.keySet().equals(java.util.Set.of("purpose", "armId", "pressId", "direction", "speed"))
                && validId(parameters.get("armId")) && validId(parameters.get("pressId"))
                && parameters.get("direction") instanceof String direction
                && java.util.Set.of("forward", "reverse", "left", "right").contains(direction)
                && parameters.get("speed") instanceof Number speed
                && Double.isFinite(speed.doubleValue()) && speed.doubleValue() > 0 && speed.doubleValue() <= 1;
        if (!rearm && !movement) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "잘못된 확인 요청입니다.");
        }
        String id = UUID.randomUUID().toString();
        var pending = new Waiting(robotId, new CompletableFuture<>());
        synchronized (state) {
            state.requireOwner(operator);
            state.requireNotEmergency();
            state.requireVersion(version);
            waiting.put(id, pending);
        }
        try {
            var payload = new MqttCommandPayload(id, robotId, "manual-challenge", id, version,
                    null, operator, Instant.now(), "normal", parameters);
            transport.publish(topics.modeCommandOutbound(robotId), mapper.writeValueAsBytes(payload), 0, false);
            String token = pending.result().get(1, TimeUnit.SECONDS);
            synchronized (state) {
                state.requireOwner(operator);
                state.requireNotEmergency();
                state.requireVersion(version);
            }
            return token;
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "장비 확인이 중단됐습니다.");
        } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException failure) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "장비 확인 응답이 없습니다.");
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "잘못된 확인 요청입니다.");
        } finally {
            waiting.remove(id, pending);
        }
    }

    private boolean validId(Object value) {
        return value instanceof String text && !text.isBlank() && text.length() <= 120;
    }

    public void receive(String robotId, String id, String token) {
        if (id == null || token == null || !token.matches("[A-Za-z0-9_-]{40,64}")) return;
        Waiting pending = waiting.get(id);
        if (pending != null && pending.robotId().equals(robotId)) pending.result().complete(token);
    }
}
