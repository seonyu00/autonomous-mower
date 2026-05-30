package com.autonomousmower.mqtt.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MqttTopicResolverTest {

    private final MqttTopicResolver topicResolver = new MqttTopicResolver();

    @Test
    void inboundTopicsMatchDocumentedContract() {
        assertThat(topicResolver.telemetryInbound("MOWER-01")).isEqualTo("mowers/MOWER-01/telemetry");
        assertThat(topicResolver.statusInbound("MOWER-01")).isEqualTo("mowers/MOWER-01/status");
        assertThat(topicResolver.eventInbound("MOWER-01")).isEqualTo("mowers/MOWER-01/events");
    }

    @Test
    void outboundTopicsMatchDocumentedContract() {
        assertThat(topicResolver.manualCommandOutbound("MOWER-01")).isEqualTo("mowers/MOWER-01/commands/manual");
        assertThat(topicResolver.stopCommandOutbound("MOWER-01")).isEqualTo("mowers/MOWER-01/commands/stop");
        assertThat(topicResolver.emergencyStopCommandOutbound("MOWER-01")).isEqualTo("mowers/MOWER-01/commands/estop");
    }
}
