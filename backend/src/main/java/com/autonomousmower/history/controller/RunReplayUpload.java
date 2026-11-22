package com.autonomousmower.history.controller;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.UUID;
import java.util.zip.GZIPInputStream;

final class RunReplayUpload {
    private static final int MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
    private static final int MAX_LINE_BYTES = 2 * 1024 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private RunReplayUpload() {}

    static boolean valid(byte[] bytes, UUID id) {
        try (var stream = new BufferedInputStream(new GZIPInputStream(new ByteArrayInputStream(bytes)))) {
            var line = new ByteArrayOutputStream();
            boolean first = true;
            boolean ended = false;
            boolean hasStep = false;
            int size = 0;
            while (true) {
                int value = stream.read();
                if (value == -1 && line.size() == 0) return ended && hasStep;
                if (++size > MAX_EXPANDED_BYTES) return false;
                if (value != -1 && value != '\n') {
                    if (line.size() >= MAX_LINE_BYTES) return false;
                    line.write(value);
                    continue;
                }
                if (line.size() > 0) {
                    var row = JSON.readTree(line.toByteArray());
                    if (row == null || !row.isObject() || ended) return false;
                    String type = row.path("type").asText();
                    if (first) {
                        if (!type.equals("run_start") || !row.path("schema").asText().equals("mower.mission.log.v1")
                                || !id.toString().equals(row.path("server_run_id").asText())
                                || !row.path("dry_run").isBoolean() || row.path("dry_run").asBoolean()) return false;
                        first = false;
                    } else if (type.isEmpty() || type.equals("run_start")) {
                        return false;
                    }
                    hasStep |= type.equals("step");
                    ended = type.equals("run_end");
                    line.reset();
                }
                if (value == -1) return ended && hasStep;
            }
        } catch (IOException malformed) {
            return false;
        }
    }
}
