import type { HistoryEntry } from '../types';

type HistoryTimelineProps = {
  entry: HistoryEntry | null;
};

export function HistoryTimeline({ entry }: HistoryTimelineProps) {
  if (!entry) {
    return (
      <div className="phase-placeholder">
        <p>작업 기록을 선택하면 관련 이벤트를 볼 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="history-timeline">
      {entry.events.map((event) => (
        <article key={event.id} className={`timeline-event ${event.severity}`}>
          <span>{new Intl.DateTimeFormat('ko-KR', { timeStyle: 'medium' }).format(new Date(event.occurredAt))}</span>
          <strong>{event.type}</strong>
          <p>{event.message}</p>
        </article>
      ))}
    </div>
  );
}
