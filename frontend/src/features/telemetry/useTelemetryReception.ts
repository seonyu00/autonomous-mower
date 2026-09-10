import { useEffect, useState } from 'react';
import { useTelemetryStore } from './telemetryStore';
import type { TelemetryReception } from './types';

export const receptionLabels: Record<TelemetryReception['state'], string> = {
  'never-seen': '미수신',
  normal: '정상',
  delayed: '지연',
};

export function useTelemetryReception(robotId: string | null) {
  const reception = useTelemetryStore((store) => robotId ? store.receptionByRobotId[robotId] : undefined);
  const telemetry = useTelemetryStore((store) => robotId ? store.telemetryByRobotId[robotId] : undefined);
  const [now, setNow] = useState(Date.now);
  const lastReceivedAt = reception ? reception.lastReceivedAt : telemetry?.lastReceivedAt;

  useEffect(() => {
    if (!lastReceivedAt) return;
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 250);
    // 백그라운드 탭의 타이머 제한이 풀리면 즉시 다시 판정한다.
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [lastReceivedAt]);

  // 서버·브라우저의 절대 시각 차이 대신 각 환경에서 흐른 시간을 합산한다.
  const elapsedMs = lastReceivedAt
    ? reception
      ? Math.max(0, Date.parse(reception.checkedAt) - Date.parse(lastReceivedAt)) + Math.max(0, now - reception.observedAt)
      : Math.max(0, now - Date.parse(lastReceivedAt))
    : null;
  const state: TelemetryReception['state'] = elapsedMs === null ? 'never-seen'
    : reception?.state === 'delayed' || elapsedMs >= 3000 ? 'delayed' : 'normal';

  return { state, elapsedMs };
}
