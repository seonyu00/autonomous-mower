import type { HistoryEntry } from '../types';

type HistoryTimelineProps = {
  entry: HistoryEntry | null;
};

export function HistoryTimeline({ entry }: HistoryTimelineProps) {
  if (!entry) {
    return (
      <div className="phase-placeholder">
        <p>Event timeline placeholder. Select a run to inspect mock events.</p>
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
