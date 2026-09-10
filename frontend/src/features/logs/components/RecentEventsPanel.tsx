import { useEffect, useState } from 'react';
import { env } from '../../../shared/config/env';
import { useAuthStore } from '../../auth/authStore';
import { useRobotStore } from '../../robots/robotStore';
import { getLogs } from '../api';
import { useRecentEventsStore } from '../recentEventsStore';
import type { RecentEvent } from '../types';

const emptyEvents: RecentEvent[] = [];

export function RecentEventsPanel() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const recentEvents = useRecentEventsStore((state) =>
    isAuthenticated && selectedRobotId ? state.eventsByRobotId[selectedRobotId] ?? emptyEvents : emptyEvents,
  );
  const mergeEvents = useRecentEventsStore((state) => state.mergeEvents);
  const [request, setRequest] = useState<{ robotId: string | null; sessionVersion: number; loading: boolean; error: string | null }>({
    robotId: null, sessionVersion: -1, loading: false, error: null,
  });
  const currentRequest = request.robotId === selectedRobotId && request.sessionVersion === sessionVersion;
  const loading = Boolean(isAuthenticated && selectedRobotId && (!currentRequest || request.loading));
  const error = currentRequest ? request.error : null;

  useEffect(() => {
    if (!selectedRobotId || !isAuthenticated) return;
    let active = true;
    const robotId = selectedRobotId;
    const isCurrent = () => active && useRobotStore.getState().selectedRobotId === robotId &&
      useAuthStore.getState().sessionVersion === sessionVersion && useAuthStore.getState().isAuthenticated;
    setRequest({ robotId, sessionVersion, loading: true, error: null });
    void getLogs({ robotId, severity: 'all', text: '', from: '', to: '' })
      .then((events) => {
        if (!isCurrent()) return;
        mergeEvents(robotId, events);
        setRequest({ robotId, sessionVersion, loading: false, error: null });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setRequest({ robotId, sessionVersion, loading: false, error: '최근 이벤트를 불러오지 못했습니다.' });
      });
    return () => { active = false; };
  }, [isAuthenticated, selectedRobotId, sessionVersion, mergeEvents]);

  return (
    <section className="recent-events-panel" aria-label="최근 경고 및 이벤트">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">운용 기록</p>
          <h2>최근 경고 및 이벤트</h2>
        </div>
        <span className="status-pill degraded">최근 {recentEvents.length}건</span>
      </div>

      <p className="muted">{env.enableMockLogs ? '샘플 이벤트' : '실제 이벤트'}</p>
      {loading ? <p role="status" className="muted">최근 이벤트를 불러오는 중입니다.</p> : null}
      {error ? <p role="alert" className="warning-line">{error}</p> : null}
      <div className="recent-event-list">
        {recentEvents.map((event) => (
          <article key={event.id} className={`recent-event-item ${event.severity}`}>
            <div className="recent-event-meta">
              <span>{event.severity}</span>
              <time dateTime={event.occurredAt}>
                {new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(
                  new Date(event.occurredAt),
                )}
              </time>
            </div>
            <strong>{event.eventType}</strong>
            <p>{event.message}</p>
          </article>
        ))}
        {!isAuthenticated ? <p className="muted">로그인이 필요합니다.</p>
          : !selectedRobotId ? <p className="muted">로봇을 선택하세요.</p>
            : !loading && !error && recentEvents.length === 0 ? <p className="muted">최근 이벤트가 없습니다.</p> : null}
      </div>
      <a className="recent-events-more" href="/logs">전체 보기</a>
    </section>
  );
}
