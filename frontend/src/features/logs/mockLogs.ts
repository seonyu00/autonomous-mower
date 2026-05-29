import type { LogEntry } from './types';

export const mockLogEntries: LogEntry[] = [
  {
    id: 'log-001',
    robotId: 'MOWER-01',
    severity: 'warning',
    eventType: 'obstacle-detected',
    source: 'edge',
    occurredAt: '2026-05-29T00:31:12.000Z',
    message: 'Obstacle detected near north boundary. Vehicle stopped before avoidance.',
    snapshot: {
      id: 'snap-001',
      capturedAt: '2026-05-29T00:31:12.000Z',
      contentType: 'image/jpeg',
    },
    metadata: {
      distanceMeters: 1.8,
      mode: 'autonomous',
    },
  },
  {
    id: 'log-002',
    robotId: 'MOWER-02',
    severity: 'critical',
    eventType: 'communication-lost',
    source: 'server',
    occurredAt: '2026-05-29T02:52:05.000Z',
    message: 'Telemetry gap exceeded 3 seconds. Robot marked as disconnected.',
    metadata: {
      gapSeconds: 3.4,
      watchdog: true,
    },
  },
  {
    id: 'log-003',
    robotId: 'MOWER-03',
    severity: 'critical',
    eventType: 'estop',
    source: 'dashboard',
    occurredAt: '2026-05-29T04:12:44.000Z',
    message: 'Emergency stop command acknowledged. All drive and mower outputs disabled.',
    snapshot: {
      id: 'snap-003',
      capturedAt: '2026-05-29T04:12:45.000Z',
      contentType: 'image/jpeg',
    },
    metadata: {
      operator: 'admin',
      commandPriority: 1,
    },
  },
  {
    id: 'log-004',
    robotId: 'MOWER-01',
    severity: 'info',
    eventType: 'job-event',
    source: 'server',
    occurredAt: '2026-05-29T01:05:00.000Z',
    message: 'Mowing job completed. Coverage target reached.',
    metadata: {
      coveragePercent: 91,
      distanceMeters: 684,
    },
  },
  {
    id: 'log-005',
    robotId: 'MOWER-01',
    severity: 'warning',
    eventType: 'sensor-fault',
    source: 'edge',
    occurredAt: '2026-05-28T07:44:10.000Z',
    message: 'IMU variance exceeded expected range during manual inspection pause.',
    metadata: {
      sensor: 'IMU',
      variance: 0.42,
    },
  },
];
