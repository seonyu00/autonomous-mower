import { useEffect, useMemo, useState } from 'react';
import type { RobotStatus } from '../telemetry/types';
import type { LngLat } from './geojson';

export type AutoObstacle =
  | { kind: 'person'; position: LngLat }
  | { kind: 'tree' | 'bush'; ring: LngLat[] };

const displayLifetimeMs = 3000;

function isPoint(value: unknown): value is LngLat {
  return Array.isArray(value) && value.length === 2
    && typeof value[0] === 'number' && value[0] >= -180 && value[0] <= 180
    && typeof value[1] === 'number' && value[1] >= -90 && value[1] <= 90;
}

function isObstacle(value: unknown): value is AutoObstacle {
  if (typeof value !== 'object' || value === null) return false;
  const object = value as Record<string, unknown>;
  if (object.kind === 'person') return isPoint(object.position);
  return (object.kind === 'tree' || object.kind === 'bush') && Array.isArray(object.ring)
    && object.ring.length >= 4 && object.ring.length <= 33 && object.ring.every(isPoint);
}

export function useAutoMap(status: RobotStatus | undefined, zoneId: number | null | undefined,
  zoneVersion: number | null | undefined, enabled: boolean) {
  const raw = status?.autoMap;
  const frame = useMemo(() => {
    if (!raw || typeof raw !== 'object') return undefined;
    const data = raw as Record<string, unknown>;
    if (typeof data.runId !== 'string' || !data.runId || data.zoneId !== zoneId || data.zoneVersion !== zoneVersion
        || typeof data.observedAt !== 'string' || !Array.isArray(data.path) || !Array.isArray(data.obstacles)
        || data.path.length > 400 || data.obstacles.length > 16
        || !data.path.every(isPoint) || !data.obstacles.every(isObstacle)) return undefined;
    const observedAt = Date.parse(data.observedAt);
    if (!Number.isFinite(observedAt)) return undefined;
    return { observedAt, path: data.path as LngLat[], obstacles: data.obstacles as AutoObstacle[] };
  }, [raw, zoneId, zoneVersion]);
  const [expiredFrame, setExpiredFrame] = useState<typeof frame>();
  const active = enabled && status?.connectionState === 'online' && !status.stale
    && (status.edgeState === 'autonomy-start-requested' || status.edgeState === 'autonomy-running');
  useEffect(() => {
    if (!active || !frame) return;
    const timer = window.setTimeout(() => setExpiredFrame(frame), Math.max(0, frame.observedAt + displayLifetimeMs - Date.now()));
    return () => window.clearTimeout(timer);
  }, [active, frame]);
  const age = frame ? Date.now() - frame.observedAt : Infinity;
  return active && frame && frame !== expiredFrame && age >= 0 && age < displayLifetimeMs ? frame : undefined;
}
