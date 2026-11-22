import { useEffect, useState } from 'react';
import { ApiError } from '../../shared/api/errors';
import { httpClient } from '../../shared/api/httpClient';
import { useAuthStore } from '../auth/authStore';
import type { LngLat } from './geojson';

type RouteStatus = 'unreported' | 'pending' | 'available' | 'held' | 'failed' | 'ended' | 'stale';
type Snapshot = {
  robotId: string;
  workZoneId: number;
  workZoneVersion: number;
  sourceMode: 'preview' | null;
  status: RouteStatus;
  reason: string | null;
  serverTime: string;
  receivedAt: string | null;
  expiresAt: string | null;
  remainingPath: { lon: number; lat: number }[];
};

const statusLabels: Record<RouteStatus, string> = {
  unreported: 'Jetson 경로 수신 대기',
  pending: '재계획 대기',
  available: 'Jetson 남은 경로 수신',
  held: 'Jetson 경로 보류',
  failed: '경로 생성 실패',
  ended: '세션 종료',
  stale: '경로 갱신 끊김',
};

const heldReasons: Record<string, string> = {
  sensor_hold: '센서 확인 대기',
  preview_inputs_unavailable: '센서 확인 대기',
  obstacle_detected: '장애물로 경로 보류',
};

type RouteDisplay = { label: string; receivedAt?: string; preview?: boolean; path?: LngLat[] };

export function useJetsonRoute(robotId: string | null, zoneId: number | null | undefined,
  version: number | null | undefined, enabled: boolean) {
  const session = useAuthStore(state => state.sessionVersion);
  const authenticated = useAuthStore(state => state.isAuthenticated);
  const key = JSON.stringify([session, robotId, zoneId, version]);
  const [result, setResult] = useState<{ key: string; display: RouteDisplay }>();

  useEffect(() => {
    if (!enabled || !authenticated || !robotId || zoneId == null || version == null) {
      setResult(undefined);
      return;
    }
    let active = true;
    let controller: AbortController | undefined;
    let poll: number | undefined;
    let timeout: number | undefined;
    let expiry: number | undefined;
    let deadline: number | undefined;

    const display = (data: RouteDisplay) => {
      if (active) setResult({ key, display: data });
    };
    const expire = () => {
      deadline = undefined;
      setResult(current => active && current?.key === key && current.display.path
        ? { key, display: { ...current.display, label: statusLabels.stale, path: undefined } }
        : current);
    };
    const onVisibility = () => {
      if (deadline !== undefined && performance.now() >= deadline) expire();
    };
    const read = async () => {
      const request = new AbortController();
      controller = request;
      const start = performance.now();
      timeout = window.setTimeout(() => request.abort(), 5000);
      try {
        const path = `/api/robots/${encodeURIComponent(robotId)}/jetson-route/latest`;
        const data = await httpClient.get<Snapshot>(
          `${path}?workZoneId=${zoneId}&workZoneVersion=${version}`,
          { signal: request.signal, cache: 'no-store' },
        );
        if (!active) return;
        if (request.signal.aborted || data.robotId !== robotId
            || data.workZoneId !== zoneId || data.workZoneVersion !== version) {
          throw new Error('경로 응답 범위가 올바르지 않습니다.');
        }
        window.clearTimeout(expiry);
        deadline = undefined;
        const base = { receivedAt: data.receivedAt ?? undefined, preview: data.sourceMode === 'preview' };
        if (data.status !== 'available') {
          const reason = data.status === 'held' && data.reason && Object.hasOwn(heldReasons, data.reason)
            ? heldReasons[data.reason] : statusLabels[data.status];
          display({ ...base, label: reason });
          return;
        }

        const arrived = performance.now();
        const remaining = Date.parse(data.expiresAt ?? '') - Date.parse(data.serverTime) - (arrived - start);
        if (!Number.isFinite(remaining) || remaining <= 0) {
          display({ ...base, label: statusLabels.stale });
          return;
        }
        if (!base.preview || !Array.isArray(data.remainingPath) || data.remainingPath.length < 2
            || data.remainingPath.some(point => !Number.isFinite(point?.lon) || !Number.isFinite(point?.lat)
              || Math.abs(point.lon) > 180 || Math.abs(point.lat) > 90)) {
          throw new Error('경로 좌표가 올바르지 않습니다.');
        }
        deadline = arrived + remaining;
        expiry = window.setTimeout(expire, remaining);
        display({ ...base, label: statusLabels.available, path: data.remainingPath.map(({ lon, lat }) => [lon, lat]) });
      } catch (error) {
        window.clearTimeout(expiry);
        deadline = undefined;
        display({ label: error instanceof ApiError && error.status === 409
          ? '작업 구역이 변경됐습니다. 최신 구역을 불러오세요.' : '경로 조회 실패' });
      } finally {
        window.clearTimeout(timeout);
        if (active) poll = window.setTimeout(() => void read(), 1000);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    void read();
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(poll);
      window.clearTimeout(timeout);
      window.clearTimeout(expiry);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [key, enabled, authenticated, robotId, zoneId, version]);

  return enabled && authenticated && result?.key === key ? result.display : { label: '경로 조회 중…' };
}
