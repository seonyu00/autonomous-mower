import type { HistoryEntry } from '../types';

type HistoryTimelineProps = {
  entry: HistoryEntry | null;
};

export function HistoryTimeline({ entry }: HistoryTimelineProps) {
  if (!entry) {
    return (
      <div className="phase-placeholder">
        <p>이벤트 타임라인 자리표시자입니다. Mock 이벤트를 보려면 작업 기록을 선택하세요.</p>
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
