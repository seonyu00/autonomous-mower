import { describe, expect, it } from 'vitest';
import { parseTopicMessage } from './topicRouter';

describe('parseTopicMessage', () => {
  it('parses telemetry, status, control-lock, and control-events payloads', () => {
    expect(
      parseTopicMessage(
        '/topic/robots/MOWER-01/telemetry',
        JSON.stringify({
          robotId: 'MOWER-01',
          latitude: 37.5,
          longitude: 127,
          batteryLevel: 82,
          mode: 'manual',
          workState: 'mowing',
          speedMps: 0.4,
          signalStrength: 92,
          lastReceivedAt: '2026-06-13T01:00:00Z',
        }),
      ).type,
    ).toBe('telemetry');

    expect(
      parseTopicMessage(
        '/topic/robots/MOWER-01/status',
        JSON.stringify({
          robotId: 'MOWER-01',
          connectionState: 'online',
          mqttState: 'connected',
          wssState: 'connected',
          edgeState: 'connected',
          lastSeenAt: '2026-06-13T01:00:00Z',
          stale: false,
        }),
      ).type,
    ).toBe('status');

    expect(
      parseTopicMessage(
        '/topic/robots/MOWER-01/control-lock',
        JSON.stringify({
          robotId: 'MOWER-01',
          lockState: 'held',
          controlOwner: 'admin',
          controlOwnerName: 'ADMIN USER',
          mode: 'manual',
          emergency: false,
          lockVersion: 7,
          expiresAt: '2026-06-13T01:05:00Z',
          reason: 'claim-control',
          updatedAt: '2026-06-13T01:00:00Z',
        }),
      ).type,
    ).toBe('control-lock');

    expect(
      parseTopicMessage(
        '/topic/robots/MOWER-01/control-events',
        JSON.stringify({
          robotId: 'MOWER-01',
          commandId: 'cmd-001',
          commandType: 'manual-command',
          status: 'edge-ack',
          reason: null,
          requestedBy: 'admin',
          serverTimestamp: '2026-06-13T01:00:00Z',
          edgeAckAt: '2026-06-13T01:00:00.100Z',
        }),
      ).type,
    ).toBe('control-events');
  });

  it('returns unknown instead of throwing for invalid JSON or payload shape', () => {
    expect(parseTopicMessage('/topic/robots/MOWER-01/telemetry', '{')).toEqual({
      type: 'unknown',
      payload: null,
    });
    expect(parseTopicMessage('/topic/robots/MOWER-01/telemetry', JSON.stringify({ robotId: 'MOWER-01' }))).toEqual({
      type: 'unknown',
      payload: { robotId: 'MOWER-01' },
    });
  });

  it('rejects control event statuses outside the API contract', () => {
    const payload = {
      robotId: 'MOWER-01',
      commandId: 'cmd-001',
      commandType: 'manual-command',
      status: 'COMPLETED',
      reason: null,
      requestedBy: 'admin',
      serverTimestamp: '2026-06-13T01:00:00Z',
      edgeAckAt: null,
    };

    expect(parseTopicMessage('/topic/robots/MOWER-01/control-events', JSON.stringify(payload))).toEqual({
      type: 'unknown',
      payload,
    });
  });
});
