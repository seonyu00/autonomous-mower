package com.autonomousmower.mqtt.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

@Service
public class TelemetrySpool {
    public record Recording(String state, boolean possibleGap) {}
    private record Row(long seq, String json) {}
    private static final Logger log = LoggerFactory.getLogger(TelemetrySpool.class);
    private final Path directory;
    private final ObjectMapper mapper;
    private final MqttInboundPersistenceService persistence;
    private final boolean mqttEnabled;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private Connection local;
    private volatile boolean gap;
    private volatile String state = "unknown";
    private volatile long pendingSince;

    public TelemetrySpool(@Value("${app.telemetry.spool-directory:./data/telemetry-spool}") Path directory,
                          ObjectMapper mapper, MqttInboundPersistenceService persistence,
                          @Value("${app.mqtt.enabled:false}") boolean mqttEnabled) {
        this.directory = directory.toAbsolutePath();
        this.mapper = mapper;
        this.persistence = persistence;
        this.mqttEnabled = mqttEnabled;
    }

    @PostConstruct void start() {
        if (mqttEnabled) worker.scheduleWithFixedDelay(this::drain, 0, 250, TimeUnit.MILLISECONDS);
    }

    private Connection database() throws IOException, SQLException {
        if (local != null) return local;
        Files.createDirectories(directory);
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + directory.resolve("inbound.sqlite"));
        try (var sql = connection.createStatement()) {
            sql.execute("PRAGMA page_size=4096");
            sql.execute("PRAGMA max_page_count=8192");
            sql.execute("PRAGMA synchronous=FULL");
            sql.execute("CREATE TABLE IF NOT EXISTS pending(seq INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL)");
            sql.execute("CREATE TABLE IF NOT EXISTS health(id INTEGER PRIMARY KEY, gap INTEGER NOT NULL)");
            sql.execute("INSERT OR IGNORE INTO health VALUES (1,0)");
            try (var rows = sql.executeQuery("SELECT gap FROM health WHERE id=1")) {
                if (rows.next() && rows.getBoolean(1)) gap = true;
            }
            if (gap) sql.executeUpdate("UPDATE health SET gap=1 WHERE id=1");
            local = connection;
            return local;
        } catch (SQLException error) {
            connection.close();
            throw error;
        }
    }

    public synchronized void append(InboundRecord record) {
        try (var insert = database().prepareStatement("INSERT INTO pending(payload) VALUES (?)")) {
            insert.setString(1, mapper.writeValueAsString(record));
            insert.executeUpdate();
            if (pendingSince == 0) pendingSince = System.nanoTime();
        } catch (SQLException | IOException error) {
            markGap();
        }
    }

    public synchronized void markGap() {
        if (!gap) log.warn("텔레메트리 영구 기록에 누락이 있을 수 있습니다.");
        gap = true;
        try (var update = database().createStatement()) {
            update.executeUpdate("UPDATE health SET gap=1 WHERE id=1 AND gap=0");
        } catch (SQLException | IOException error) {
            log.debug("로컬 기록 누락 표시 저장 실패", error);
        }
    }

    public Recording recording() {
        long since = pendingSince;
        boolean lag = since != 0 && System.nanoTime() - since >= TimeUnit.SECONDS.toNanos(1);
        return new Recording(lag ? "buffered" : state, gap);
    }

    void drain() {
        try {
            for (int count = 0; count < 100; count++) {
                Row row = first();
                if (row == null) return;
                try {
                    if (!persistence.persist(mapper.readValue(row.json(), InboundRecord.class))) markGap();
                } catch (IllegalArgumentException invalidRun) {
                    markGap();
                } catch (DataIntegrityViolationException | com.fasterxml.jackson.core.JsonProcessingException invalid) {
                    // 영구적으로 저장할 수 없는 행은 표시하고 다음 로봇의 기록을 계속 처리한다.
                    markGap();
                }
                remove(row.seq());
                state = "available";
            }
        } catch (Exception failure) {
            if (!"buffered".equals(state)) log.warn("기록 재저장 대기: {}", failure.getClass().getSimpleName());
            state = "buffered";
        }
    }

    private synchronized Row first() throws SQLException, IOException {
        try (var select = database().createStatement();
             var rows = select.executeQuery("SELECT seq,payload FROM pending ORDER BY seq LIMIT 1")) {
            if (rows.next()) {
                if (pendingSince == 0) pendingSince = System.nanoTime();
                return new Row(rows.getLong(1), rows.getString(2));
            }
            pendingSince = 0;
            return null;
        }
    }

    private synchronized void remove(long seq) throws SQLException, IOException {
        try (var delete = database().prepareStatement("DELETE FROM pending WHERE seq=?")) {
            delete.setLong(1, seq);
            delete.executeUpdate();
        }
    }

    @PreDestroy void close() throws SQLException, InterruptedException {
        worker.shutdownNow();
        worker.awaitTermination(5, TimeUnit.SECONDS);
        synchronized (this) {
            if (local != null) local.close();
        }
    }
}
