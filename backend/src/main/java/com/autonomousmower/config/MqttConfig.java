package com.autonomousmower.config;

import com.autonomousmower.mqtt.config.MqttBridgeProperties;
import com.autonomousmower.mqtt.transport.MqttTransport;
import com.autonomousmower.mqtt.transport.NoopMqttTransport;
import com.autonomousmower.mqtt.transport.PahoMqttTransport;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.util.Properties;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
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
    MqttConnectOptions mqttConnectOptions(MqttBridgeProperties properties) throws Exception {
        MqttConnectOptions options = new MqttConnectOptions();
        options.setAutomaticReconnect(true);
        options.setCleanSession(true);
        options.setHttpsHostnameVerificationEnabled(true);
        if (properties.brokerUrl().startsWith("ssl://")) {
            Properties tlsProperties = new Properties();
            tlsProperties.setProperty("com.ibm.ssl.protocol", "TLSv1.2");
            options.setSSLProperties(tlsProperties);
        }
        if (StringUtils.hasText(properties.caCertPath())) {
            if (!properties.brokerUrl().startsWith("ssl://")) {
                throw new IllegalArgumentException("MQTT CA 파일은 ssl:// 브로커에만 사용할 수 있습니다.");
            }
            // 이 연결에서만 지정 CA를 신뢰한다. 읽기·파싱 실패 시 기본 신뢰로 우회하지 않는다.
            KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
            trustStore.load(null, null);
            try (var input = Files.newInputStream(Path.of(properties.caCertPath()))) {
                var certificates = CertificateFactory.getInstance("X.509").generateCertificates(input);
                if (certificates.isEmpty()) {
                    throw new IllegalArgumentException("MQTT CA 파일에 인증서가 없습니다.");
                }
                int index = 0;
                for (var certificate : certificates) {
                    trustStore.setCertificateEntry("mqtt-ca-" + index++, certificate);
                }
            }
            TrustManagerFactory trustManagers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            trustManagers.init(trustStore);
            SSLContext sslContext = SSLContext.getInstance("TLSv1.2");
            sslContext.init(null, trustManagers.getTrustManagers(), null);
            options.setSocketFactory(sslContext.getSocketFactory());
        }
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
