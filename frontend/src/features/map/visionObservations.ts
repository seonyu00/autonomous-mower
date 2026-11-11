import { useEffect, useState } from 'react';
import { httpClient } from '../../shared/api/httpClient';
import { useAuthStore } from '../auth/authStore';
import type { PolygonGeometry } from './geojson';

export type VisionState = 'MOW_NOW' | 'DANGEROUS' | 'DEFERRED_MOWABLE' | 'NOT_MOWABLE' | 'UNKNOWN';
export type VisionRegion = {
  observationId: string;
  version: number;
  state: VisionState;
  source: string;
  observedAt: string;
  geometry: PolygonGeometry | { type: 'MultiPolygon'; coordinates: PolygonGeometry['coordinates'][] };
  stale: boolean;
};
export type VisionMap = {
  robotId: string;
  version: number;
  serverTime: string;
  regions: VisionRegion[];
  dangerHistory: VisionRegion[];
  nextHistoryCursor: number | null;
};
export const visionLabels: Record<VisionState, string> = {
  MOW_NOW: '예초 가능 후보', DANGEROUS: '위험', DEFERRED_MOWABLE: '예초 보류',
  NOT_MOWABLE: '예초 불가', UNKNOWN: '미확인',
};
export const visionColors: Record<VisionState, string> = {
  MOW_NOW: '#238255', DANGEROUS: '#b63232', DEFERRED_MOWABLE: '#a56713',
  NOT_MOWABLE: '#60676b', UNKNOWN: '#516a94',
};
export function visionPolygons(region: VisionRegion): PolygonGeometry[] {
  return region.geometry.type === 'Polygon' ? [region.geometry]
    : region.geometry.coordinates.map(coordinates => ({ type: 'Polygon', coordinates }));
}
export function useVisionObservations(robotId: string | null, version: number | null | undefined, enabled: boolean) {
  const session = useAuthStore(state => state.sessionVersion);
  const authenticated = useAuthStore(state => state.isAuthenticated);
  const key = `${session}:${robotId}:${version}`;
  const [result, setResult] = useState<{ key: string; data?: VisionMap; error: boolean }>({ key: '', error: false });
  const [page, setPage] = useState<{ key: string; cursor: number | null }>({ key: '', cursor: null });
  const cursor = page.key === key ? page.cursor : null;
  useEffect(() => {
    if (!enabled || !authenticated || !robotId || version == null) {
      setResult({ key: '', error: false });
      return;
    }
    let active = true;
    let controller: AbortController | undefined;
    let timer: number | undefined;
    let requestTimeout: number | undefined;
    const read = async () => {
      controller = new AbortController();
      requestTimeout = window.setTimeout(() => controller?.abort(), 5000);
      try {
        const data = await httpClient.get<VisionMap>(`/api/robots/${encodeURIComponent(robotId)}/vision-map?version=${version}${cursor == null ? '' : `&before=${cursor}`}`, { signal: controller.signal });
        if (active && !controller.signal.aborted) setResult({ key, data, error: false });
      } catch {
        if (active) setResult({ key, error: true });
      } finally {
        window.clearTimeout(requestTimeout);
        if (active) timer = window.setTimeout(() => void read(), 1000);
      }
    };
    void read();
    return () => { active = false; controller?.abort(); window.clearTimeout(timer); window.clearTimeout(requestTimeout); };
  }, [key, enabled, authenticated, robotId, version, cursor]);
  const current = enabled && authenticated && result.key === key ? result : undefined;
  return { data: current?.data, isError: current?.error ?? false, isPending: !current,
    nextHistory: () => { setPage({ key, cursor: current?.data?.nextHistoryCursor ?? null }); setResult({ key: '', error: false }); },
    latestHistory: () => { setPage({ key, cursor: null }); setResult({ key: '', error: false }); } };
}
