import { useRobotStore } from '../../robots/robotStore';
import { mockLogEntries } from '../mockLogs';

export function RecentEventsPanel() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const robotEvents = mockLogEntries
    .filter((event) => event.robotId === selectedRobotId)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const recentEvents = robotEvents.slice(0, 3);

  return (
    <section className="recent-events-panel" aria-label="최근 경고 및 이벤트">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">운용 기록</p>
          <h2>최근 경고 및 이벤트</h2>
        </div>
        <span className="status-pill degraded">{robotEvents.length}건</span>
      </div>

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
        {recentEvents.length === 0 ? <p className="muted">최근 이벤트가 없습니다.</p> : null}
      </div>
      <a className="recent-events-more" href="/logs">전체 보기</a>
    </section>
  );
}
