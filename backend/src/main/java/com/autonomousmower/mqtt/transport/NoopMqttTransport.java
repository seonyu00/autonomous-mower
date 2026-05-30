package com.autonomousmower.mqtt.transport;

public class NoopMqttTransport implements MqttTransport {

    @Override
    public void publish(String topic, byte[] payload, int qos, boolean retained) {
        // Intentionally empty: local/test runs must not require an MQTT broker.
    }
}
