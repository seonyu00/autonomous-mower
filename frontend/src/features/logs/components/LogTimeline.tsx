import type { LogEntry } from '../types';

type LogTimelineProps = {
  logs: LogEntry[];
  selectedLogId: string | null;
  onSelectLog: (logId: string) => void;
};

export function LogTimeline({ logs, selectedLogId, onSelectLog }: LogTimelineProps) {
  if (logs.length === 0) {
    return <p className="muted">선택한 조건에 맞는 로그가 없습니다.</p>;
  }

  return (
    <ol className="log-timeline">
      {logs.map((log, index) => (
        <li key={log.id}>
          {(index === 0 || new Date(log.occurredAt).toDateString() !== new Date(logs[index - 1].occurredAt).toDateString()) && (
            <h3 className="log-date-heading">{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(log.occurredAt))}</h3>
          )}
          <button
            className={log.id === selectedLogId ? `log-event ${log.severity} selected` : `log-event ${log.severity}`}
            type="button"
            aria-pressed={log.id === selectedLogId}
            aria-controls="log-detail"
            onClick={() => onSelectLog(log.id)}
          >
            <time dateTime={log.occurredAt}>{new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(log.occurredAt))}</time>
            <span className={`log-severity ${log.severity}`}>{{ info: '정보', warning: '경고', critical: '치명' }[log.severity]}</span>
            <span className="log-event-content">
              <strong>{log.eventType}</strong>
              <span className="log-event-message">{log.message}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
