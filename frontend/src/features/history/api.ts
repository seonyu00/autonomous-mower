import { httpClient } from '../../shared/api/httpClient';
import { mockHistoryEntries } from './mockHistory';
import type { HistoryEntry, HistoryQuery } from './types';

export async function getHistory(query: HistoryQuery): Promise<HistoryEntry[]> {
  if (import.meta.env.DEV) {
    const from = new Date(`${query.from}T00:00:00.000Z`).getTime();
    const to = new Date(`${query.to}T23:59:59.999Z`).getTime();

    return mockHistoryEntries.filter((entry) => {
      const startedAt = new Date(entry.startedAt).getTime();

      return entry.robotId === query.robotId && startedAt >= from && startedAt <= to;
    });
  }

  const searchParams = new URLSearchParams({
    robotId: query.robotId,
    from: query.from,
    to: query.to,
  });

  return httpClient.get<HistoryEntry[]>(`/api/history?${searchParams.toString()}`);
}
