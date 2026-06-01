# MQTT Topic 계약

This document is the frozen local integration contract between the Spring Boot backend and the Jetson edge process before Jetson implementation starts.

Jetson code is not implemented in this repository yet. The Edge Mock must follow this document so backend, frontend, and Jetson integration tests use the same topic and payload contract.

## Version

- Contract version: `mqtt-command-v1`
- Encoding: UTF-8 JSON
- Broker: MQTT 3.1.1 compatible
- Retained messages: false for all topics in this phase
- Timestamp format: ISO-8601 UTC string, for example `2026-05-31T01:23:45.678Z`
- `robotId` path and payload must match exactly. A receiver must reject mismatched messages.

## Topic Map

### Backend To Edge

| Topic | Direction | QoS | Payload |
|---|---:|---:|---|
| `mowers/{robotId}/commands/manual` | Backend -> Jetson | 0 | Command payload with `commandType="manual-command"` |
| `mowers/{robotId}/commands/stop` | Backend -> Jetson | 1 | Command payload with `commandType="stop"` |
| `mowers/{robotId}/commands/estop` | Backend -> Jetson | 1 | Command payload with `commandType="emergency-stop"` |
| `mowers/{robotId}/commands/mode` | Backend -> Jetson | 1 | Command payload with `commandType="change-mode"` |
| `mowers/{robotId}/commands/attachment` | Backend -> Jetson | 1 | Command payload with `commandType="mower-attachment"` |

### Edge To Backend

| Topic | Direction | QoS | Payload |
|---|---:|---:|---|
| `mowers/{robotId}/telemetry` | Jetson -> Backend | 1 | Telemetry payload |
| `mowers/{robotId}/status` | Jetson -> Backend | 1 | Status payload |
| `mowers/{robotId}/events` | Jetson -> Backend | 1 | Event payload |
| `mowers/{robotId}/commands/ack` | Jetson -> Backend | 1 | Command ack payload |

## Command Payload

All backend-to-edge command messages use the same envelope:

```json
{
  "commandId": "cmd-uuid-or-server-id",
  "robotId": "MOWER-01",
  "commandType": "manual-command",
  "idempotencyKey": "manual-uuid-from-client",
  "lockVersion": 7,
  "clientSentAt": "2026-05-31T01:23:45.678Z",
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:45.700Z",
  "priority": "normal",
  "parameters": {}
}
```

Field policy:

| Field | Required | Policy |
|---|---:|---|
| `commandId` | yes | Backend-generated unique command identifier. Jetson must echo it in ack. |
| `robotId` | yes | Must match `{robotId}` in the topic. |
| `commandType` | yes | One of `manual-command`, `stop`, `emergency-stop`, `change-mode`, `mower-attachment`. |
| `idempotencyKey` | manual/stop/mode/attachment/estop yes, deadman stop may be null | Originates from frontend REST command where available. Jetson must use `(robotId, idempotencyKey)` to ignore duplicate QoS 1 deliveries when the value is present. |
| `lockVersion` | manual/stop/mode/attachment yes, estop/deadman may be null | Control lock version observed by backend when command was accepted. Jetson must reject stale normal commands if it tracks a newer lock version. E-Stop ignores lock version. |
| `clientSentAt` | manual yes, others may be null | Frontend timestamp for latency/staleness checks. Manual commands older than 500 ms at Jetson receive time must be ignored and converted to a local stop. |
| `requestedBy` | yes | Backend account id or `system` for server-generated deadman stop. |
| `requestedAt` | yes | Backend acceptance/publish time. |
| `priority` | yes | `normal`, `stop`, or `emergency`. |
| `parameters` | yes | Command-specific object. Empty object is allowed only when specified below. |

### Manual Command

Topic: `mowers/{robotId}/commands/manual`

QoS: 0

```json
{
  "commandId": "cmd-manual-001",
  "robotId": "MOWER-01",
  "commandType": "manual-command",
  "idempotencyKey": "manual-uuid",
  "lockVersion": 7,
  "clientSentAt": "2026-05-31T01:23:45.678Z",
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:45.700Z",
  "priority": "normal",
  "parameters": {
    "direction": "forward",
    "speed": 0.6
  }
}
```

Rules:

- `direction`: `forward`, `backward`, `left`, `right`, or `stop`.
- `speed`: number from `0.0` to `1.0`.
- Manual command processing is latest-wins. Jetson must not queue stale joystick messages.
- Jetson must stop drive output if no fresh manual command is received within 500 ms while manual movement is active.

### Stop Command

Topic: `mowers/{robotId}/commands/stop`

QoS: 1

```json
{
  "commandId": "cmd-stop-001",
  "robotId": "MOWER-01",
  "commandType": "stop",
  "idempotencyKey": "stop-uuid",
  "lockVersion": 7,
  "clientSentAt": null,
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:46.000Z",
  "priority": "stop",
  "parameters": {
    "reason": "operator-stop",
    "speed": 0
  }
}
```

Rules:

- `speed` must be `0`.
- Jetson must stop drive output immediately.
- Stop does not clear emergency state if emergency is already active.
- Backend deadman stop uses this command with `requestedBy="system"`, `reason="deadman-timeout"`, and nullable `idempotencyKey`/`lockVersion`.

### Emergency Stop Command

Topic: `mowers/{robotId}/commands/estop`

QoS: 1

```json
{
  "commandId": "cmd-estop-001",
  "robotId": "MOWER-01",
  "commandType": "emergency-stop",
  "idempotencyKey": "estop-uuid",
  "lockVersion": null,
  "clientSentAt": null,
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:47.000Z",
  "priority": "emergency",
  "parameters": {
    "reason": "operator emergency stop"
  }
}
```

Rules:

- E-Stop outranks every normal command, mode command, and attachment command.
- Jetson must stop drive output and mower attachment output immediately.
- Jetson must enter emergency state and reject all normal commands until backend sends an explicit reset over a future reset contract. In the current contract, reset is backend state only and does not command Jetson to resume.
- E-Stop must still be accepted if there is no active control lock.

### Mode Command

Topic: `mowers/{robotId}/commands/mode`

QoS: 1

```json
{
  "commandId": "cmd-mode-001",
  "robotId": "MOWER-01",
  "commandType": "change-mode",
  "idempotencyKey": "mode-uuid",
  "lockVersion": 7,
  "clientSentAt": null,
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:48.000Z",
  "priority": "normal",
  "parameters": {
    "mode": "autonomous"
  }
}
```

Rules:

- `mode`: `idle`, `manual`, `autonomous`, or `home`.
- Jetson must reject mode changes while emergency state is active.
- Mode change must not implicitly start drive or attachment output unless Jetson autonomous logic explicitly owns that behavior.

### Attachment Command

Topic: `mowers/{robotId}/commands/attachment`

QoS: 1

```json
{
  "commandId": "cmd-attachment-001",
  "robotId": "MOWER-01",
  "commandType": "mower-attachment",
  "idempotencyKey": "attachment-uuid",
  "lockVersion": 7,
  "clientSentAt": null,
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:49.000Z",
  "priority": "normal",
  "parameters": {
    "attachmentAction": "blade-start"
  }
}
```

Rules:

- `attachmentAction`: `blade-start`, `blade-stop`, `raise`, or `lower`.
- Jetson must reject attachment commands while emergency state is active.
- E-Stop must cut blade output even if a previous attachment command started it.

## Telemetry Payload

Topic: `mowers/{robotId}/telemetry`

QoS: 1

Publish rate: nominal 1 Hz.

```json
{
  "robotId": "MOWER-01",
  "latitude": 37.50011,
  "longitude": 127.00011,
  "batteryLevel": 82,
  "mode": "manual",
  "workState": "mowing",
  "speedMps": 0.4,
  "signalStrength": 92,
  "receivedAt": "2026-05-31T01:23:50.000Z",
  "errorState": null
}
```

Field policy:

- `batteryLevel`: integer `0..100`.
- `mode`: `idle`, `manual`, `autonomous`, `home`, or `emergency`.
- `workState`: `idle`, `mowing`, `paused`, `returning-home`, or `error`.
- `speedMps`: current ground speed in meters per second.
- `signalStrength`: integer `0..100`.
- `receivedAt`: Jetson timestamp when telemetry sample was produced.
- `errorState`: nullable machine-readable string.

## Status Payload

Topic: `mowers/{robotId}/status`

QoS: 1

Publish rate: nominal every 3 seconds and immediately after command state changes.

```json
{
  "robotId": "MOWER-01",
  "connectionState": "online",
  "mqttState": "connected",
  "edgeState": "connected",
  "lastSeenAt": "2026-05-31T01:23:51.000Z",
  "stale": false
}
```

Field policy:

- `connectionState`: `online`, `degraded`, or `offline`.
- `mqttState`: `connected`, `reconnecting`, or `disconnected`.
- `edgeState`: `connected`, `manual`, `autonomous`, `emergency`, or `fault`.
- `stale`: true when Jetson considers upstream telemetry/control state stale.

## Event Payload

Topic: `mowers/{robotId}/events`

QoS: 1

Publish when an edge event occurs.

```json
{
  "id": "event-1717118631000",
  "robotId": "MOWER-01",
  "severity": "warning",
  "eventType": "obstacle-detected",
  "message": "Obstacle detected by front sensor.",
  "occurredAt": "2026-05-31T01:23:52.000Z",
  "source": "jetson"
}
```

Field policy:

- `severity`: `info`, `warning`, `error`, or `critical`.
- `eventType`: `job-event`, `obstacle-detected`, `communication-lost`, `sensor-fault`, `controller-error`, or `estop`.
- `message`: concise human-readable message for logs.
- `source`: `jetson`, `stm32`, `edge-mock`, or another stable component id.

## Command Ack Payload

Topic: `mowers/{robotId}/commands/ack`

QoS: 1

Jetson must publish one ack for every non-duplicate command it accepts, rejects, executes, or fails.

```json
{
  "commandId": "cmd-stop-001",
  "robotId": "MOWER-01",
  "commandType": "stop",
  "status": "accepted",
  "reason": null,
  "edgeNodeId": "jetson-MOWER-01",
  "receivedAt": "2026-05-31T01:23:46.020Z",
  "ackedAt": "2026-05-31T01:23:46.030Z"
}
```

Field policy:

- `commandId`: copied from command payload.
- `commandType`: copied from command payload.
- `status`: `accepted`, `rejected`, `executed`, or `failed`.
- `reason`: nullable machine-readable reason. Required for `rejected` and `failed`.
- `edgeNodeId`: stable Jetson process/client id.
- `receivedAt`: Jetson receive time.
- `ackedAt`: Jetson ack publish time.

Recommended ack sequence:

- For `manual-command`, publish `accepted` only when the command is fresh enough to apply. Publish `rejected` with `reason="stale-command"` if stale.
- For `stop` and `emergency-stop`, publish `accepted` immediately after the safety action is issued locally. A later `executed` ack may be added once STM32 confirms it.
- For mode and attachment commands, publish `accepted` after local validation and `failed` if STM32 bridge rejects the command.

## Jetson Processing Rules

1. Subscribe to all backend-to-edge command topics for its own `robotId`.
2. Reject any message whose topic robot id and payload `robotId` differ.
3. Validate `commandType`, `priority`, and command-specific parameters before forwarding to STM32.
4. Maintain recent `(robotId, idempotencyKey)` entries for QoS 1 duplicate suppression. If `idempotencyKey` is null, use `commandId`.
5. Treat `emergency-stop` as highest priority and preempt any queued or active command.
6. Do not queue manual commands. Keep only the most recent valid manual command.
7. Stop drive output when manual command freshness exceeds 500 ms.
8. Publish command ack on `mowers/{robotId}/commands/ack` with QoS 1.
9. Publish status immediately after emergency, stop, mode, attachment, connection, or fault state changes.
10. Never auto-resume a previous drive or attachment command after E-Stop reset.

## STM32 Serial Bridge Draft

This is a draft minimum line protocol between Jetson and STM32. It is not Jetson code.

Transport:

- UART serial
- UTF-8 line-delimited JSON
- One command per line, newline terminator `\n`
- STM32 should reply with one ack line per accepted/rejected command.

Jetson to STM32 command examples:

```json
{"type":"drive","commandId":"cmd-manual-001","direction":"forward","speed":0.6,"ttlMs":500}
```

```json
{"type":"stop","commandId":"cmd-stop-001","reason":"operator-stop"}
```

```json
{"type":"estop","commandId":"cmd-estop-001","reason":"operator emergency stop"}
```

```json
{"type":"mode","commandId":"cmd-mode-001","mode":"autonomous"}
```

```json
{"type":"attachment","commandId":"cmd-attachment-001","action":"blade-start"}
```

STM32 to Jetson ack examples:

```json
{"commandId":"cmd-stop-001","status":"accepted","reason":null,"timestamp":"2026-05-31T01:23:46.025Z"}
```

```json
{"commandId":"cmd-attachment-001","status":"rejected","reason":"emergency-active","timestamp":"2026-05-31T01:23:49.025Z"}
```

STM32 safety rules:

- If no valid drive command is received within `ttlMs`, drive PWM must return to neutral.
- E-Stop must force drive PWM neutral and disable mower attachment output.
- Serial payload should add checksum or framed CRC before field deployment; JSON line format is only the integration draft.

## Backend And Edge Mock Verification Targets

Current backend constants and Edge Mock topics must match this contract:

- `MqttTopicResolver`: backend topic construction
- `MqttInboundSubscriber`: inbound wildcard subscriptions
- `tools/edge-mock-client/src/index.js`: mock publish/subscribe topics and QoS

Any topic change must update this document and both implementations in the same commit.
