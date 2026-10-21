package com.autonomousmower.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.autonomousmower.mqtt.config.MqttBridgeProperties;
import com.autonomousmower.mqtt.transport.PahoMqttTransport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.SSLHandshakeException;
import javax.net.ssl.SSLPeerUnverifiedException;
import org.eclipse.paho.client.mqttv3.MqttAsyncClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

// 실제 서비스 대신 전용 loopback 브로커에서만 실행한다. 설정이 없으면 명시적으로 생략한다.
@EnabledIfEnvironmentVariable(named = "MQTT_SECURITY_CONFIG", matches = ".+")
class MqttTlsIntegrationTest {
    private JsonNode fixture;
    private String brokerUrl;
    private final MqttConfig config = new MqttConfig();

    @BeforeEach
    void readIsolatedFixture() throws Exception {
        fixture = new ObjectMapper().readTree(Files.readString(Path.of(System.getenv("MQTT_SECURITY_CONFIG"))));
        URI uri = URI.create(fixture.path("brokerUrl").asText());
        assertThat(uri.getScheme()).isEqualTo("mqtts");
        assertThat(uri.getHost()).isIn("localhost", "127.0.0.1");
        assertThat(uri.getPort()).isEqualTo(18886);
        assertThat(uri.getRawUserInfo()).isNull();
        assertThat(uri.getRawPath()).isEmpty();
        assertThat(uri.getRawQuery()).isNull();
        assertThat(uri.getRawFragment()).isNull();
        assertThat(fixture.path("containerName").asText()).startsWith("mower-mqtt-security-");
        assertThat(fixture.path("robotIds").toString()).isEqualTo("[\"SECURITY-TEST-01\",\"SECURITY-TEST-02\"]");
        brokerUrl = "ssl://" + uri.getHost() + ":18886";
    }

    @Test
    void exchangesCommandAndAckUsingConfiguredJavaTransport() throws Exception {
        try (LocalClient backend = client("backend", brokerUrl, "caCertPath", null);
             LocalClient edge = client("edge1", brokerUrl, "caCertPath", null)) {
            backend.connect();
            edge.connect();
            String commandTopic = "mowers/SECURITY-TEST-01/commands/stop";
            String ackTopic = "mowers/SECURITY-TEST-01/commands/ack";
            String marker = "java-tls-" + UUID.randomUUID();
            CompletableFuture<String> command = new CompletableFuture<>();
            CompletableFuture<String> ack = new CompletableFuture<>();
            edge.client.subscribe(commandTopic, 1, (topic, message) ->
                    command.complete(new String(message.getPayload(), StandardCharsets.UTF_8))).waitForCompletion(5000);
            backend.client.subscribe(ackTopic, 1, (topic, message) ->
                    ack.complete(new String(message.getPayload(), StandardCharsets.UTF_8))).waitForCompletion(5000);
            new PahoMqttTransport(backend.client, backend.options)
                    .publish(commandTopic, marker.getBytes(StandardCharsets.UTF_8), 1, false);
            assertThat(command.get(5, TimeUnit.SECONDS)).isEqualTo(marker);
            edge.client.publish(ackTopic, marker.getBytes(StandardCharsets.UTF_8), 1, false).waitForCompletion(5000);
            assertThat(ack.get(5, TimeUnit.SECONDS)).isEqualTo(marker);
        }
    }

    @Test
    void rejectsUntrustedCa() throws Exception {
        assertTlsRejected(brokerUrl, "wrongCaCertPath");
    }

    @Test
    void rejectsHostnameMismatch() throws Exception {
        assertTlsRejected("ssl://127.0.0.1:18886", "caCertPath");
    }

    @Test
    void rejectsWrongPassword() throws Exception {
        assertAuthenticationRejected(UUID.randomUUID().toString());
    }

    @Test
    void rejectsAnonymousConnection() throws Exception {
        assertAuthenticationRejected("");
    }

    private void assertTlsRejected(String url, String caField) throws Exception {
        try (LocalClient local = client("backend", url, caField, null)) {
            assertThatThrownBy(local::connect).isInstanceOf(MqttException.class).satisfies(error -> {
                Throwable cause = error;
                while (cause != null && !(cause instanceof SSLHandshakeException) && !(cause instanceof SSLPeerUnverifiedException)) {
                    cause = cause.getCause();
                }
                assertThat(cause).as("실제 TLS 인증서/호스트명 거부").isNotNull();
            });
        }
    }

    private void assertAuthenticationRejected(String password) throws Exception {
        try (LocalClient local = client("backend", brokerUrl, "caCertPath", password)) {
            assertThatThrownBy(local::connect).isInstanceOf(MqttException.class).satisfies(error ->
                    assertThat(((MqttException) error).getReasonCode()).isIn(4, 5));
        }
    }

    private LocalClient client(String role, String url, String caField, String passwordOverride) throws Exception {
        JsonNode account = fixture.path("accounts").path(role);
        String password = passwordOverride == null ? account.path("password").asText() : passwordOverride;
        String username = "".equals(passwordOverride) ? "" : account.path("username").asText();
        var properties = new MqttBridgeProperties(true, url, username, password,
                "mqtt-security-java-" + UUID.randomUUID(), fixture.path(caField).asText());
        MqttConnectOptions options = config.mqttConnectOptions(properties);
        options.setMqttVersion(MqttConnectOptions.MQTT_VERSION_3_1_1);
        options.setAutomaticReconnect(false);
        options.setConnectionTimeout(3);
        return new LocalClient(config.mqttAsyncClient(properties), options);
    }

    private record LocalClient(MqttAsyncClient client, MqttConnectOptions options) implements AutoCloseable {
        void connect() throws MqttException {
            client.connect(options).waitForCompletion(8000);
        }

        @Override
        public void close() throws MqttException {
            if (client.isConnected()) {
                client.disconnect().waitForCompletion(5000);
            }
            client.close(true);
        }
    }
}
