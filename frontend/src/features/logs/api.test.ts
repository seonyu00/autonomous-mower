import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getBlob: vi.fn(),
}));

vi.mock('../../shared/config/env', () => ({
  env: {
    enableMockLogs: false,
  },
}));

vi.mock('../../shared/api/httpClient', () => ({
  httpClient: {
    get: mocks.get,
    getBlob: mocks.getBlob,
  },
}));

import { getLogs } from './api';
import { env } from '../../shared/config/env';

describe('logs api', () => {
  beforeEach(() => {
    env.enableMockLogs = false;
    mocks.get.mockReset();
    mocks.get.mockResolvedValue([]);
  });

  it.each([['2026-06-15', '', 'from'], ['', '2026-06-16', 'to']])(
    'sends only the supplied date boundary (%s, %s)', async (from, to, boundary) => {
      await getLogs({ robotId: 'all', severity: 'critical', text: ' edge ', from, to });
      const params = new URL(mocks.get.mock.calls[0][0], 'http://localhost').searchParams;
      expect(params.has(boundary)).toBe(true);
      expect(params.has(boundary === 'from' ? 'to' : 'from')).toBe(false);
      expect(params.get('robotId')).toBeNull();
      expect(params.get('severity')).toBe('critical');
      expect(params.get('text')).toBe('edge');
    },
  );

  it('rejects reversed dates before requesting logs', async () => {
    await expect(getLogs({ robotId: 'all', severity: 'all', text: '',
      from: '2026-06-16', to: '2026-06-15' })).rejects.toThrow();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('combines mock source search with an open date range and severity', async () => {
    env.enableMockLogs = true;
    const logs = await getLogs({ robotId: 'all', severity: 'critical', text: ' SERVER ',
      from: '', to: '2026-05-29' });
    expect(logs.map((log) => log.id)).toContain('log-002');
    expect(logs.every((log) => log.severity === 'critical' && log.source === 'server'
      && log.occurredAt <= '2026-05-29T23:59:59.999Z')).toBe(true);
  });

  it('sends text search only when a real search term is provided', async () => {
    await getLogs({
      robotId: 'MOWER-01',
      severity: 'warning',
      text: 'snapshot',
      from: '2026-06-15',
      to: '2026-06-16',
    });

    expect(mocks.get).toHaveBeenCalledWith(
      '/api/logs?from=2026-06-15T00%3A00%3A00.000Z&to=2026-06-16T23%3A59%3A59.999Z&robotId=MOWER-01&severity=warning&text=snapshot',
    );
  });

  it('omits all filters and blank text from the real query', async () => {
    await getLogs({
      robotId: 'all',
      severity: 'all',
      text: '   ',
      from: '2026-06-15',
      to: '2026-06-15',
    });

    expect(mocks.get).toHaveBeenCalledWith(
      '/api/logs?from=2026-06-15T00%3A00%3A00.000Z&to=2026-06-15T23%3A59%3A59.999Z',
    );
  });
});
