import { beforeEach, expect, it, vi } from 'vitest';
import { getHistory } from './api';
import { env } from '../../shared/config/env';
import { httpClient } from '../../shared/api/httpClient';
import { mockHistoryEntries } from './mockHistory';

vi.mock('../../shared/api/httpClient', () => ({ httpClient: { get: vi.fn() } }));
beforeEach(() => { env.enableMockHistory = false; vi.mocked(httpClient.get).mockReset().mockResolvedValue([]); });

it('개발 환경에서도 실제 API에 UTC 날짜 전체를 Instant 범위로 보낸다', async () => {
  await getHistory({ robotId: 'actual', from: '2026-09-10', to: '2026-09-11' });
  const params = new URL(vi.mocked(httpClient.get).mock.calls[0][0], 'http://localhost').searchParams;
  expect(params.get('robotId')).toBe('actual');
  expect(params.get('from')).toBe('2026-09-10T00:00:00.000Z');
  expect(params.get('to')).toBe('2026-09-11T23:59:59.999999999Z');
});

it.each([['', '2026-09-10'], ['2026-09-11', '2026-09-10'], ['2026-02-30', '2026-03-01']])(
  '유효하지 않은 날짜 범위는 조회하지 않는다: %s ~ %s', async (from, to) => {
    await expect(getHistory({ robotId: 'actual', from, to })).rejects.toThrow();
    expect(httpClient.get).not.toHaveBeenCalled();
  },
);

it('명시적인 Mock만 샘플을 조회한다', async () => {
  env.enableMockHistory = true;
  const result = await getHistory({ robotId: 'MOWER-01', from: '2026-05-28', to: '2026-05-29' });
  expect(result.length).toBeGreaterThan(0);
  expect(httpClient.get).not.toHaveBeenCalled();
});

it('offset 없는 서버 시각은 UTC로 해석하고 명시된 offset은 보존한다', async () => {
  vi.mocked(httpClient.get).mockResolvedValue([{ ...mockHistoryEntries[0],
    startedAt: '2026-09-10T00:00:00', endedAt: '2026-09-10T10:00:00+09:00',
  }]);
  const [result] = await getHistory({ robotId: 'actual', from: '2026-09-10', to: '2026-09-10' });
  expect(result.startedAt).toBe('2026-09-10T00:00:00Z');
  expect(result.endedAt).toBe('2026-09-10T10:00:00+09:00');
});
