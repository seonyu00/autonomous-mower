package com.autonomousmower.mqtt.transport;

import org.eclipse.paho.client.mqttv3.MqttAsyncClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;

public class PahoMqttTransport implements MqttTransport {

    private final MqttAsyncClient mqttAsyncClient;
    private final MqttConnectOptions mqttConnectOptions;

    public PahoMqttTransport(MqttAsyncClient mqttAsyncClient, MqttConnectOptions mqttConnectOptions) {
        this.mqttAsyncClient = mqttAsyncClient;
        this.mqttConnectOptions = mqttConnectOptions;
    }

    @Override
    public synchronized void publish(String topic, byte[] payload, int qos, boolean retained) {
        try {
            if (!mqttAsyncClient.isConnected()) {
                mqttAsyncClient.connect(mqttConnectOptions).waitForCompletion();
            }
            MqttMessage message = new MqttMessage(payload);
            message.setQos(qos);
            message.setRetained(retained);
            mqttAsyncClient.publish(topic, message);
        } catch (MqttException exception) {
            throw new IllegalStateException("Failed to publish MQTT message to " + topic, exception);
        }
    }

    public void close() {
        try {
            if (mqttAsyncClient.isConnected()) {
                mqttAsyncClient.disconnect().waitForCompletion();
            }
            mqttAsyncClient.close();
        } catch (MqttException exception) {
            throw new IllegalStateException("Failed to close MQTT client.", exception);
        }
    }
}
