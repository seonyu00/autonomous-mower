import type { LogEntry } from './types';

export const mockLogEntries: LogEntry[] = [
  {
    id: 'log-001',
    robotId: 'MOWER-01',
    severity: 'warning',
    eventType: 'obstacle-detected',
    source: 'edge',
    occurredAt: '2026-05-29T00:31:12.000Z',
    message: '북쪽 경계 근처에서 장애물이 감지되었습니다. 회피 동작 전에 차량이 정지했습니다.',
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
    message: '텔레메트리(Telemetry) 공백이 3초를 초과했습니다. 로봇을 연결 끊김 상태로 표시했습니다.',
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
    message: '긴급 정지(E-Stop) 명령이 확인되었습니다. 모든 주행 및 예초 출력이 비활성화되었습니다.',
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
    message: '예초 작업이 완료되었습니다. 커버리지 목표에 도달했습니다.',
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
    message: '수동 점검 일시 정지 중 IMU 분산이 예상 범위를 초과했습니다.',
    metadata: {
      sensor: 'IMU',
      variance: 0.42,
    },
  },
];
