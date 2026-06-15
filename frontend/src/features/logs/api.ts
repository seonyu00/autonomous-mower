import { httpClient } from '../../shared/api/httpClient';
import { env } from '../../shared/config/env';
import { mockLogEntries } from './mockLogs';
import type { LogEntry, LogQuery } from './types';

export async function getLogs(query: LogQuery): Promise<LogEntry[]> {
  if (env.enableMockLogs) {
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
    from: `${query.from}T00:00:00.000Z`,
    to: `${query.to}T23:59:59.999Z`,
  });

  if (query.robotId !== 'all') {
    searchParams.set('robotId', query.robotId);
  }

  if (query.severity !== 'all') {
    searchParams.set('severity', query.severity);
  }

  return httpClient.get<LogEntry[]>(`/api/logs?${searchParams.toString()}`);
}

export function getSnapshotBlob(url: string): Promise<Blob> {
  return httpClient.getBlob(url);
}
