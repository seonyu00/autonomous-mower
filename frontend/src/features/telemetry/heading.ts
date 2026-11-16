import type { Telemetry } from './types';

export function telemetryHeadingDegrees(telemetry: Telemetry | undefined, nowMonotonic: number): number | null {
  if (telemetry?.headingSource !== 'dual-gps' || typeof telemetry.headingDegrees !== 'number'
    || !Number.isFinite(telemetry.headingDegrees) || telemetry.headingDegrees < 0 || telemetry.headingDegrees >= 360
    || typeof telemetry.headingExpiresAtMonotonic !== 'number' || nowMonotonic >= telemetry.headingExpiresAtMonotonic) {
    return null;
  }
  return telemetry.headingDegrees;
}
