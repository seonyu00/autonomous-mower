package com.autonomousmower.realtime.service;

public final class RealtimeTopics {

    private RealtimeTopics() {
    }

    public static String telemetry(String robotId) {
        return robotTopic(robotId, "telemetry");
    }

    public static String status(String robotId) {
        return robotTopic(robotId, "status");
    }

    public static String events(String robotId) {
        return robotTopic(robotId, "events");
    }

    public static String controlLock(String robotId) {
        return robotTopic(robotId, "control-lock");
    }

    public static String controlEvents(String robotId) {
        return robotTopic(robotId, "control-events");
    }

    public static String videoStatus(String robotId) {
        return robotTopic(robotId, "video-status");
    }

    private static String robotTopic(String robotId, String topicName) {
        return "/topic/robots/" + robotId + "/" + topicName;
    }
}
