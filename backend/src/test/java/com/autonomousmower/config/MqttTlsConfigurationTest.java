package com.autonomousmower.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class MqttTlsConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(MqttConfig.class)
            .withPropertyValues("app.mqtt.enabled=true", "app.mqtt.client-id=mqtt-tls-unit-test");

    @Test
    void keepsLocalPlaintextWithoutCa() {
        runner.withPropertyValues("app.mqtt.broker-url=tcp://localhost:18991").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(MqttConnectOptions.class).getSocketFactory()).isNull();
        });
    }

    @Test
    void rejectsCaOnPlaintextConnection() {
        runner.withPropertyValues("app.mqtt.broker-url=tcp://localhost:18991", "app.mqtt.ca-cert-path=missing-ca.crt")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void rejectsMissingCaWithoutFallingBackToSystemTrust() {
        runner.withPropertyValues("app.mqtt.broker-url=ssl://localhost:18991", "app.mqtt.ca-cert-path=missing-ca.crt")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void verifiesHostnameForSystemTrustAsWell() {
        runner.withPropertyValues("app.mqtt.broker-url=ssl://localhost:18991").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(MqttConnectOptions.class).isHttpsHostnameVerificationEnabled()).isTrue();
        });
    }
}
