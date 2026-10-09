package com.autonomousmower.mqtt.transport;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import org.eclipse.paho.client.mqttv3.*;
import org.junit.jupiter.api.Test;

class PahoMqttTransportTest {
    @Test
    void asynchronousPublishFailurePropagatesWithFiniteWait() throws Exception {
        var client = mock(MqttAsyncClient.class);
        var token = mock(IMqttDeliveryToken.class);
        when(client.isConnected()).thenReturn(true);
        when(client.publish(anyString(), any(MqttMessage.class))).thenReturn(token);
        doThrow(new MqttException(MqttException.REASON_CODE_CLIENT_TIMEOUT)).when(token).waitForCompletion(5000);
        var transport = new PahoMqttTransport(client, new MqttConnectOptions());
        assertThatThrownBy(() -> transport.publish("fake/topic", new byte[0], 1, false))
                .isInstanceOf(IllegalStateException.class).hasCauseInstanceOf(MqttException.class);
        verify(token).waitForCompletion(5000);
    }

    @Test
    void connectFailureDoesNotAttemptPublish() throws Exception {
        var client = mock(MqttAsyncClient.class);
        var token = mock(IMqttToken.class);
        when(client.connect(any(MqttConnectOptions.class))).thenReturn(token);
        doThrow(new MqttException(MqttException.REASON_CODE_CLIENT_TIMEOUT)).when(token).waitForCompletion(5000);
        var transport = new PahoMqttTransport(client, new MqttConnectOptions());
        assertThatThrownBy(() -> transport.publish("fake/topic", new byte[0], 0, false)).isInstanceOf(IllegalStateException.class);
        verify(client, never()).publish(anyString(), any(MqttMessage.class));
    }
}
