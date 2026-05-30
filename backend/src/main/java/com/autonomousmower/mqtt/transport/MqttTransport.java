package com.autonomousmower.mqtt.transport;

public interface MqttTransport {

    void publish(String topic, byte[] payload, int qos, boolean retained);
}
