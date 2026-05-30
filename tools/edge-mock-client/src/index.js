const mqtt = require("mqtt");

const config = {
  brokerUrl: env("MQTT_BROKER_URL", "mqtt://localhost:1883"),
  username: env("MQTT_USERNAME", ""),
  password: env("MQTT_PASSWORD", ""),
  robotId: env("ROBOT_ID", "MOWER-01"),
  clientId: env("MQTT_CLIENT_ID", `edge-mock-${env("ROBOT_ID", "MOWER-01")}-${process.pid}`),
  telemetryIntervalMs: numberEnv("TELEMETRY_INTERVAL_MS", 1000),
  statusIntervalMs: numberEnv("STATUS_INTERVAL_MS", 3000),
  eventIntervalMs: numberEnv("EVENT_INTERVAL_MS", 15000)
};

const topic = {
  telemetry: `mowers/${config.robotId}/telemetry`,
  status: `mowers/${config.robotId}/status`,
  events: `mowers/${config.robotId}/events`,
  commandAck: `mowers/${config.robotId}/commands/ack`,
  manualCommand: `mowers/${config.robotId}/commands/manual`,
  modeCommand: `mowers/${config.robotId}/commands/mode`,
  attachmentCommand: `mowers/${config.robotId}/commands/attachment`,
  stopCommand: `mowers/${config.robotId}/commands/stop`,
  estopCommand: `mowers/${config.robotId}/commands/estop`
};

let tick = 0;
let lastMode = "idle";
let emergency = false;

const client = mqtt.connect(config.brokerUrl, {
  clientId: config.clientId,
  username: config.username || undefined,
  password: config.password || undefined,
  clean: true,
  reconnectPeriod: 2000,
  connectTimeout: 5000
});

client.on("connect", () => {
  log("connected", { brokerUrl: config.brokerUrl, robotId: config.robotId, clientId: config.clientId });
  subscribeCommandTopics();
  publishStatus();
  publishTelemetry();
});

client.on("reconnect", () => log("reconnecting", { brokerUrl: config.brokerUrl }));
client.on("error", (error) => log("mqtt-error", { message: error.message }));
client.on("close", () => log("connection-closed", {}));

client.on("message", (receivedTopic, payload) => {
  const text = payload.toString("utf8");
  const parsed = parseJson(text);

  if (receivedTopic === topic.estopCommand) {
    emergency = true;
    lastMode = "emergency";
  } else if (receivedTopic === topic.stopCommand) {
    lastMode = emergency ? "emergency" : "idle";
  } else if (receivedTopic === topic.manualCommand && !emergency) {
    lastMode = "manual";
  } else if (receivedTopic === topic.modeCommand && !emergency) {
    lastMode = parsed?.parameters?.mode ?? parsed?.mode ?? lastMode;
  }

  log("command-received", {
    topic: receivedTopic,
    qosExpected: expectedCommandQos(receivedTopic),
    payload: parsed ?? text
  });

  publishCommandAck(receivedTopic, parsed);
  publishStatus();
});

setInterval(publishTelemetry, config.telemetryIntervalMs);
setInterval(publishStatus, config.statusIntervalMs);
setInterval(publishEvent, config.eventIntervalMs);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function subscribeCommandTopics() {
  client.subscribe(topic.manualCommand, { qos: 0 }, logSubscribe(topic.manualCommand));
  client.subscribe(topic.modeCommand, { qos: 1 }, logSubscribe(topic.modeCommand));
  client.subscribe(topic.attachmentCommand, { qos: 1 }, logSubscribe(topic.attachmentCommand));
  client.subscribe(topic.stopCommand, { qos: 1 }, logSubscribe(topic.stopCommand));
  client.subscribe(topic.estopCommand, { qos: 1 }, logSubscribe(topic.estopCommand));
}

function publishTelemetry() {
  tick += 1;
  const payload = {
    robotId: config.robotId,
    latitude: 37.5001 + tick * 0.00001,
    longitude: 127.0001 + tick * 0.00001,
    batteryLevel: Math.max(10, 82 - Math.floor(tick / 60)),
    mode: lastMode,
    workState: emergency ? "error" : lastMode === "manual" ? "mowing" : "idle",
    speedMps: emergency || lastMode === "idle" ? 0 : 0.4,
    signalStrength: 92,
    receivedAt: new Date().toISOString(),
    errorState: emergency ? "emergency-stop-active" : null
  };
  publishJson(topic.telemetry, payload, 1);
}

function publishStatus() {
  const payload = {
    robotId: config.robotId,
    connectionState: emergency ? "degraded" : "online",
    mqttState: "connected",
    edgeState: emergency ? "emergency" : "connected",
    lastSeenAt: new Date().toISOString(),
    stale: false
  };
  publishJson(topic.status, payload, 1);
}

function publishEvent() {
  const eventTypes = ["job-event", "obstacle-detected", "communication-lost", "sensor-fault"];
  const eventType = emergency ? "estop" : eventTypes[tick % eventTypes.length];
  const severity = eventType === "job-event" ? "info" : eventType === "estop" ? "critical" : "warning";
  const payload = {
    id: `event-${Date.now()}`,
    robotId: config.robotId,
    severity,
    eventType,
    message: emergency ? "Emergency stop is active." : `Mock edge event: ${eventType}`,
    occurredAt: new Date().toISOString(),
    source: "edge-mock"
  };
  publishJson(topic.events, payload, 1);
}

function publishCommandAck(receivedTopic, command) {
  if (!command || typeof command !== "object") {
    return;
  }
  const now = new Date().toISOString();
  const payload = {
    commandId: command.commandId ?? null,
    robotId: config.robotId,
    commandType: command.commandType ?? commandTypeFromTopic(receivedTopic),
    status: "accepted",
    reason: null,
    edgeNodeId: config.clientId,
    receivedAt: now,
    ackedAt: now
  };
  publishJson(topic.commandAck, payload, 1);
}

function publishJson(targetTopic, payload, qos) {
  if (!client.connected) {
    return;
  }
  client.publish(targetTopic, JSON.stringify(payload), { qos, retain: false }, (error) => {
    if (error) {
      log("publish-failed", { topic: targetTopic, message: error.message });
    }
  });
}

function shutdown() {
  log("shutdown", {});
  client.end(false, {}, () => process.exit(0));
}

function expectedCommandQos(receivedTopic) {
  if (receivedTopic === topic.manualCommand) {
    return 0;
  }
  if (receivedTopic === topic.stopCommand || receivedTopic === topic.estopCommand) {
    return 1;
  }
  if (receivedTopic === topic.modeCommand || receivedTopic === topic.attachmentCommand) {
    return 1;
  }
  return null;
}

function commandTypeFromTopic(receivedTopic) {
  if (receivedTopic === topic.manualCommand) {
    return "manual-command";
  }
  if (receivedTopic === topic.stopCommand) {
    return "stop";
  }
  if (receivedTopic === topic.estopCommand) {
    return "emergency-stop";
  }
  if (receivedTopic === topic.modeCommand) {
    return "change-mode";
  }
  if (receivedTopic === topic.attachmentCommand) {
    return "mower-attachment";
  }
  return "unknown";
}

function logSubscribe(subscribeTopic) {
  return (error) => {
    if (error) {
      log("subscribe-failed", { topic: subscribeTopic, message: error.message });
      return;
    }
    log("subscribed", { topic: subscribeTopic });
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function env(name, fallback) {
  return process.env[name] || fallback;
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function log(event, details) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...details }));
}
