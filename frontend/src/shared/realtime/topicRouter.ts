import type { ControlCommandEvent, ControlLockSnapshot } from '../../features/control/types';
import type { RobotStatus, Telemetry } from '../../features/telemetry/types';

export type TopicMessage =
  | {
      type: 'telemetry';
      payload: Telemetry;
    }
  | {
      type: 'status';
      payload: RobotStatus;
    }
  | {
      type: 'control-lock';
      payload: ControlLockSnapshot;
    }
  | {
      type: 'control-events';
      payload: ControlCommandEvent;
    }
  | {
      type: 'unknown';
      payload: unknown;
    };

export function parseTopicMessage(topic: string, rawPayload: string): TopicMessage {
  let payload: unknown;

  try {
    payload = JSON.parse(rawPayload) as unknown;
  } catch {
    return { type: 'unknown', payload: null };
  }

  if (topic.endsWith('/telemetry') && isTelemetry(payload)) {
    return {
      type: 'telemetry',
      payload,
    };
  }

  if (topic.endsWith('/status') && isRobotStatus(payload)) {
    return {
      type: 'status',
      payload,
    };
  }

  if (topic.endsWith('/control-lock') && isControlLockSnapshot(payload)) {
    return {
      type: 'control-lock',
      payload,
    };
  }

  if (topic.endsWith('/control-events') && isControlCommandEvent(payload)) {
    return {
      type: 'control-events',
      payload,
    };
  }

  return {
    type: 'unknown',
    payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isControlEventStatus(value: unknown): value is ControlCommandEvent['status'] {
  return (
    value === 'accepted' ||
    value === 'rejected' ||
    value === 'sent-to-edge' ||
    value === 'edge-ack' ||
    value === 'edge-timeout' ||
    value === 'failed'
  );
}

function isTelemetry(value: unknown): value is Telemetry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.robotId) &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    typeof value.batteryLevel === 'number' &&
    isString(value.mode) &&
    isString(value.workState) &&
    typeof value.speedMps === 'number' &&
    typeof value.signalStrength === 'number' &&
    isString(value.lastReceivedAt)
  );
}

function isRobotStatus(value: unknown): value is RobotStatus {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.robotId) &&
    isString(value.connectionState) &&
    isString(value.mqttState) &&
    isString(value.wssState) &&
    isString(value.edgeState) &&
    isString(value.lastSeenAt) &&
    typeof value.stale === 'boolean'
  );
}

function isControlLockSnapshot(value: unknown): value is ControlLockSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.robotId) &&
    isString(value.lockState) &&
    isNullableString(value.controlOwner) &&
    isNullableString(value.controlOwnerName) &&
    isString(value.mode) &&
    typeof value.emergency === 'boolean' &&
    typeof value.lockVersion === 'number' &&
    isNullableString(value.expiresAt) &&
    isNullableString(value.reason) &&
    isString(value.updatedAt)
  );
}

function isControlCommandEvent(value: unknown): value is ControlCommandEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.robotId) &&
    isString(value.commandId) &&
    isString(value.commandType) &&
    isControlEventStatus(value.status) &&
    isNullableString(value.reason) &&
    isString(value.requestedBy) &&
    isString(value.serverTimestamp) &&
    isNullableString(value.edgeAckAt)
  );
}
