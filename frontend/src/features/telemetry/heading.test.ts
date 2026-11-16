import { describe, expect, it } from 'vitest';
import { telemetryHeadingDegrees } from './heading';
import { useTelemetryStore } from './telemetryStore';
import { mockTelemetry } from './mockTelemetry';

describe('듀얼 GPS 기체 방향', () => {
  const sample = Object.values(mockTelemetry)[0];
  it('정지 위치에서도 센서가 제공한 방향을 사용한다', () => {
    const value = { ...sample, headingDegrees: 274, headingSource: 'dual-gps' as const, headingExpiresAtMonotonic: 3000 };
    expect(telemetryHeadingDegrees(value, 0)).toBe(274);
    expect(telemetryHeadingDegrees({ ...value, headingDegrees: 0 }, 0)).toBe(0);
    expect(telemetryHeadingDegrees(value, 3000)).toBeNull();
  });
  it('이전 송신기나 유효하지 않은 값에서는 방향을 만들지 않는다', () => {
    expect(telemetryHeadingDegrees(sample, 0)).toBeNull();
    expect(telemetryHeadingDegrees({ ...sample, headingDegrees: NaN }, 0)).toBeNull();
  });
  it('수신 시 실제 측정 경과 시간을 포함한 만료 한도를 만든다', () => {
    useTelemetryStore.getState().upsertTelemetry({ ...sample, headingDegrees: 274, headingSource: 'dual-gps',
      headingObservedAt: '2026-11-16T00:00:00Z', edgeSampledAt: '2026-11-16T00:00:01Z',
      serverTimestamp: '2026-11-16T00:00:02Z' });
    const received = useTelemetryStore.getState().telemetryByRobotId[sample.robotId];
    const remaining = received.headingExpiresAtMonotonic! - performance.now();
    expect(remaining).toBeGreaterThan(800);
    expect(remaining).toBeLessThanOrEqual(1000);
  });
});
