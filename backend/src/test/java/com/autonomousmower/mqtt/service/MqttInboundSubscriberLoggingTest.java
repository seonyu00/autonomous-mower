package com.autonomousmower.mqtt.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.autonomousmower.control.service.ManualChallengeService;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import org.eclipse.paho.client.mqttv3.MqttAsyncClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class MqttInboundSubscriberLoggingTest {
    @Test
    void malformedPayloadDoesNotLeakInLog(CapturedOutput output) throws Exception {
        var subscriber = new MqttInboundSubscriber(mock(MqttAsyncClient.class), mock(MqttConnectOptions.class),
                mock(MqttInboundHandler.class), new ObjectMapper(), mock(ManualChallengeService.class));
        Method handle = MqttInboundSubscriber.class.getDeclaredMethod("handleMessage", String.class, MqttMessage.class);
        handle.setAccessible(true);
        String marker = "private-value-for-log-test";
        handle.invoke(subscriber, "mowers/test/commands/ack",
                new MqttMessage(("{\"challenge\":\"" + marker + "\",invalid}").getBytes(StandardCharsets.UTF_8)));
        assertThat(output.getAll()).contains("Failed to process MQTT inbound", "errorType=");
        assertThat(output.getAll()).doesNotContain(marker, "payload=");
    }
}
