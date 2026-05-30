# Backend Phase 6 Safety Notes

Phase 6 control safety state is a mock backend foundation only.

## Current Scope

- Control lock state is stored in process memory by `robotId`.
- Emergency state is stored in process memory by `robotId`.
- Deadman timeout currently emits a server-side synthetic stop event through STOMP `control-events`.
- No MQTT, Jetson, STM32, motor, blade, relay, or hardware fail-safe command is sent in this phase.

## Operational Limits

- In-memory control state is lost on backend restart.
- In-memory control state is not shared across multiple backend instances.
- A production deployment must move control lock, emergency state, command sequence, and idempotency records to a shared transactional store.
- A production deployment must ensure only one active safety authority evaluates lock expiration and deadman timeout per robot, or use distributed locking.
- Deadman timeout events in this phase are observability skeletons. Hardware stop output still requires MQTT/edge/STM32 integration.

## Reset Policy

- E-Stop activation requires `control:write` and does not require current lock ownership.
- Emergency reset requires `control:write`.
- If a control owner exists, reset is accepted only from that owner or from a user with `control:takeover`.
- If no owner exists, an authenticated `control:write` user may reset after verifying safe state.
