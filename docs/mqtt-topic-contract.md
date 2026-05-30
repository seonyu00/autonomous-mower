# MQTT Topic Contract

Phase 7 defines the backend/edge MQTT bridge skeleton. Jetson/STM32 implementation is not part of this phase.

## Inbound Edge To Backend

- `mowers/{robotId}/telemetry`
  - QoS: 1
  - Payload: `MqttTelemetryPayload`
- `mowers/{robotId}/status`
  - QoS: 1
  - Payload: `MqttStatusPayload`
- `mowers/{robotId}/events`
  - QoS: 1
  - Payload: `MqttEventPayload`

Inbound telemetry/status/event messages are mapped to STOMP through `RealtimePublisher`.

## Outbound Backend To Edge

- `mowers/{robotId}/commands/manual`
  - QoS: 0
  - Latest joystick/manual command wins; stale command queueing must be avoided.
- `mowers/{robotId}/commands/stop`
  - QoS: 1
- `mowers/{robotId}/commands/estop`
  - QoS: 1
  - Emergency stop is published through a dedicated method and should be called before normal command side effects.

## Configuration

- `MQTT_ENABLED`
- `MQTT_BROKER_URL`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_CLIENT_ID`

When `MQTT_ENABLED=false`, the backend uses a no-op transport so tests and local API work do not require a broker.

## Open Decisions Before Jetson Integration

- Exact Jetson JSON field names and versioning for all payloads.
- Whether telemetry/status/event inbound subscriptions are installed by Spring Integration, Paho callbacks, or a dedicated adapter.
- Command ack topic and payload shape, including `commandId`, sequence number, status, and error reason.
- Idempotency and sequence handling for duplicate QoS 1 delivery.
- TLS/MQTTS certificate, username/password, and client identity policy.
- Retained-message policy for status topics.
- Backpressure/latest-wins handling for high-rate manual commands.
