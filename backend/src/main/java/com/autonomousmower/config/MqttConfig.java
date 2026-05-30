package com.autonomousmower.config;

import com.autonomousmower.mqtt.config.MqttBridgeProperties;
import com.autonomousmower.mqtt.transport.MqttTransport;
import com.autonomousmower.mqtt.transport.NoopMqttTransport;
import com.autonomousmower.mqtt.transport.PahoMqttTransport;
import org.eclipse.paho.client.mqttv3.MqttAsyncClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
@EnableConfigurationProperties(MqttBridgeProperties.class)
public class MqttConfig {

    @Bean
    @ConditionalOnProperty(prefix = "app.mqtt", name = "enabled", havingValue = "true")
    MqttAsyncClient mqttAsyncClient(MqttBridgeProperties properties) throws org.eclipse.paho.client.mqttv3.MqttException {
        return new MqttAsyncClient(properties.brokerUrl(), properties.clientId(), new MemoryPersistence());
    }

    @Bean
    @ConditionalOnProperty(prefix = "app.mqtt", name = "enabled", havingValue = "true")
    MqttConnectOptions mqttConnectOptions(MqttBridgeProperties properties) {
        MqttConnectOptions options = new MqttConnectOptions();
        options.setAutomaticReconnect(true);
        options.setCleanSession(true);
        if (StringUtils.hasText(properties.username())) {
            options.setUserName(properties.username());
        }
        if (StringUtils.hasText(properties.password())) {
            options.setPassword(properties.password().toCharArray());
        }
        return options;
    }

    @Bean
    @ConditionalOnProperty(prefix = "app.mqtt", name = "enabled", havingValue = "true")
    MqttTransport pahoMqttTransport(MqttAsyncClient mqttAsyncClient, MqttConnectOptions mqttConnectOptions) {
        return new PahoMqttTransport(mqttAsyncClient, mqttConnectOptions);
    }

    @Bean
    @ConditionalOnProperty(prefix = "app.mqtt", name = "enabled", havingValue = "false", matchIfMissing = true)
    MqttTransport noopMqttTransport() {
        return new NoopMqttTransport();
    }
}
