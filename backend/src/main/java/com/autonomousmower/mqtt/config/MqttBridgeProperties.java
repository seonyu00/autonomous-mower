package com.autonomousmower.mqtt.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.mqtt")
public record MqttBridgeProperties(
        boolean enabled,
        String brokerUrl,
        String username,
        String password,
        String clientId
) {
}
