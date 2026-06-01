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
    <div className="log-timeline">
      {logs.map((log) => (
        <button
          key={log.id}
          className={log.id === selectedLogId ? `log-event ${log.severity} selected` : `log-event ${log.severity}`}
          type="button"
          onClick={() => onSelectLog(log.id)}
        >
          <span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(log.occurredAt))}</span>
          <strong>{log.eventType}</strong>
          <p>{log.message}</p>
          <small>
            {log.robotId} | {log.source} | {log.severity}
          </small>
        </button>
      ))}
    </div>
  );
}
