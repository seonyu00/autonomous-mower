import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../features/auth/authStore';
import { getHistory } from '../features/history/api';
import { HistoryMap } from '../features/history/components/HistoryMap';
import { HistoryTimeline } from '../features/history/components/HistoryTimeline';
import { mockHistoryEntries } from '../features/history/mockHistory';
import type { HistoryEntry } from '../features/history/types';
import { useRobotStore } from '../features/robots/robotStore';
import { env } from '../shared/config/env';

export function HistoryPage() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const robots = useRobotStore((state) => state.robots);
  const robotError = useRobotStore((state) => state.error);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const [requestedRobotId, setRobotId] = useState('');
  const robotId = robots.some((robot) => robot.id === requestedRobotId) ? requestedRobotId : robots[0]?.id ?? '';
  const [from, setFrom] = useState(() => env.enableMockHistory ? '2026-05-28' : koreaDate());
  const [to, setTo] = useState(() => env.enableMockHistory ? '2026-05-29' : koreaDate());
  const [entries, setEntries] = useState<HistoryEntry[]>(() =>
    env.enableMockHistory ? mockHistoryEntries.filter((entry) => entry.robotId === (robots[0]?.id ?? '')) : [],
  );
  const [selectedEntryId, setSelectedEntryId] = useState(entries[0]?.id ?? null);
  const queryKey = JSON.stringify([robotId, from, to, sessionVersion]);
  const [resultKey, setResultKey] = useState(queryKey);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(env.enableMockHistory ? 'success' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const visibleEntries = resultKey === queryKey ? entries : [];

  useEffect(() => () => { requestId.current += 1; }, [queryKey]);

  const selectedEntry = visibleEntries.find((entry) => entry.id === selectedEntryId) ?? visibleEntries[0] ?? null;

  const handleSearch = async () => {
    const currentRequest = ++requestId.current;
    const isCurrent = () => currentRequest === requestId.current
      && useAuthStore.getState().sessionVersion === sessionVersion;
    setResultKey(queryKey);
    setEntries([]);
    setError(null);
    setStatus('loading');
    try {
      const result = await getHistory({ robotId, from, to });
      if (!isCurrent()) return;
      setEntries(result);
      setSelectedEntryId(result[0]?.id ?? null);
      setStatus('success');
    } catch (cause) {
      if (!isCurrent()) return;
      setError(cause instanceof Error ? cause.message : '이력을 불러오지 못했습니다.');
      setStatus('error');
    }
  };

  const changeFilter = (update: () => void) => {
    requestId.current += 1;
    setEntries([]);
    setStatus('idle');
    update();
  };

  return (
    <div className="history-page">
      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">2단계</p>
            <h2>작업 이력</h2>
          </div>
          <span className="status-pill connected">{env.enableMockHistory ? '샘플 데이터' : '실제 이력'}</span>
        </div>

        <div className="history-filters">
          <label>
            로봇
            <select value={robotId} onChange={(event) => changeFilter(() => setRobotId(event.target.value))}>
              {robots.map((robot) => (
                <option key={robot.id} value={robot.id}>
                  {robot.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            시작일 (한국 시간)
            <input type="date" value={from} onChange={(event) => changeFilter(() => setFrom(event.target.value))} />
          </label>

          <label>
            종료일 (한국 시간)
            <input type="date" value={to} onChange={(event) => changeFilter(() => setTo(event.target.value))} />
          </label>

          <button className="primary-button" type="button" disabled={!robotId} onClick={handleSearch}>
            검색
          </button>
        </div>
        {robotError ? <p role="alert">로봇 목록을 불러오지 못했습니다. {robotError}</p> : null}
        {!robotId && !robotError ? <p className="muted">조회할 로봇이 없습니다.</p> : null}
      </section>

      <section className="workspace-panel history-map-panel">
        <HistoryMap selectedEntry={selectedEntry} />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">작업 기록</p>
            <h2>검색 결과</h2>
          </div>
          <span className="status-pill connected">{visibleEntries.length}건</span>
        </div>
        <div className="history-result-list">
          {visibleEntries.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === selectedEntry?.id ? 'history-result selected' : 'history-result'}
              type="button"
              onClick={() => setSelectedEntryId(entry.id)}
            >
              <strong>{entry.robotId}</strong>
              <span>{entry.recordType === 'run' ? runStatus(entry, now) : '작업 구분 전 기록'}</span>
              <span>{formatRange(entry.startedAt, entry.endedAt)}</span>
              {entry.lastObservedAt ? <span>마지막 작업 확인: {formatRange(entry.lastObservedAt, entry.lastObservedAt).split(' - ')[0]}</span> : null}
              {entry.hasGpsGap ? <span>GPS 수신 끊김 · 부분 거리</span> : null}
              <small>
                {entry.distanceMeters == null ? '거리 미집계' : `${Math.round(entry.distanceMeters * 10) / 10} m${entry.distancePartial ? ' (부분 거리)' : ''}`} | {entry.coveragePercent == null ? '커버리지 미집계' : `커버리지 ${entry.coveragePercent}%`}
              </small>
            </button>
          ))}
          {resultKey === queryKey && status === 'loading' ? <p role="status">이력을 불러오는 중입니다.</p> : null}
          {resultKey === queryKey && status === 'error' ? <p role="alert">이력을 불러오지 못했습니다. {error}</p> : null}
          {resultKey === queryKey && status === 'success' && visibleEntries.length === 0 ? <p className="muted">선택한 조건에 맞는 작업 이력이 없습니다.</p> : null}
          {status === 'idle' || resultKey !== queryKey ? <p className="muted">조회 조건을 선택하고 검색해 주세요.</p> : null}
        </div>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">이벤트</p>
            <h2>이벤트 타임라인</h2>
          </div>
        </div>
        <HistoryTimeline entry={selectedEntry} />
      </section>
    </div>
  );
}

function koreaDate() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatRange(startedAt: string, endedAt?: string) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  });

  return `${formatter.format(new Date(startedAt))} - ${endedAt ? formatter.format(new Date(endedAt)) : '종료 시각 미확인'}`;
}

function runStatus(entry: HistoryEntry, now: number) {
  if (entry.status === 'running' && entry.checkedAt && entry.lastObservedAt && entry.receivedAtClient != null
      && new Date(entry.checkedAt).getTime() - new Date(entry.lastObservedAt).getTime()
        + Math.max(0, now - entry.receivedAtClient) >= 30_000) return '종료 확인 불가';
  return entry.status === 'completed'  ? '완료' : entry.status === 'unconfirmed' ? '종료 확인 불가' : '진행 중';
}
