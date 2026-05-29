import { httpClient } from '../../shared/api/httpClient';
import { mockLogEntries } from './mockLogs';
import type { LogEntry, LogQuery } from './types';

export async function getLogs(query: LogQuery): Promise<LogEntry[]> {
  if (import.meta.env.DEV) {
    const from = new Date(`${query.from}T00:00:00.000Z`).getTime();
    const to = new Date(`${query.to}T23:59:59.999Z`).getTime();
    const text = query.text.trim().toLowerCase();

    return mockLogEntries.filter((entry) => {
      const occurredAt = new Date(entry.occurredAt).getTime();
      const robotMatches = query.robotId === 'all' || entry.robotId === query.robotId;
      const severityMatches = query.severity === 'all' || entry.severity === query.severity;
      const textMatches =
        text.length === 0 ||
        entry.message.toLowerCase().includes(text) ||
        entry.eventType.toLowerCase().includes(text);

      return robotMatches && severityMatches && textMatches && occurredAt >= from && occurredAt <= to;
    });
  }

  const searchParams = new URLSearchParams({
    robotId: query.robotId,
    severity: query.severity,
    text: query.text,
    from: query.from,
    to: query.to,
  });

  return httpClient.get<LogEntry[]>(`/api/logs?${searchParams.toString()}`);
}
