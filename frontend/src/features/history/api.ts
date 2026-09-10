import { env } from '../../shared/config/env';
import { httpClient } from '../../shared/api/httpClient';
import { mockHistoryEntries } from './mockHistory';
import type { HistoryEntry, HistoryQuery } from './types';

export async function getHistory(query: HistoryQuery): Promise<HistoryEntry[]> {
  if (!isUtcDate(query.from) || !isUtcDate(query.to) || query.from > query.to) {
    throw new Error('시작일과 종료일을 올바른 순서로 입력해 주세요.');
  }
  const fromIso = `${query.from}T00:00:00.000Z`;
  const toIso = `${query.to}T23:59:59.999999999Z`;
  if (env.enableMockHistory) {
    const from = new Date(fromIso).getTime();
    const to = new Date(toIso).getTime();

    return mockHistoryEntries.filter((entry) => {
      const startedAt = new Date(entry.startedAt).getTime();

      return entry.robotId === query.robotId && startedAt >= from && startedAt <= to;
    });
  }

  const searchParams = new URLSearchParams({
    robotId: query.robotId,
    from: fromIso,
    to: toIso,
  });

  const entries = await httpClient.get<HistoryEntry[]>(`/api/history?${searchParams.toString()}`);
  // 백엔드의 offset 없는 LocalDateTime 응답은 기존 UTC 계약으로 해석한다.
  return entries.map((entry) => ({
    ...entry,
    startedAt: utcTimestamp(entry.startedAt),
    endedAt: entry.endedAt ? utcTimestamp(entry.endedAt) : undefined,
    events: entry.events.map((event) => ({ ...event, occurredAt: utcTimestamp(event.occurredAt) })),
  }));
}

function isUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function utcTimestamp(value: string) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
}
