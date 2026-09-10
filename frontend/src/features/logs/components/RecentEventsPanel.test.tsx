import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores } from '../../../test/testStores';
import { env } from '../../../shared/config/env';
import { getLogs } from '../api';
import { mockLogEntries } from '../mockLogs';
import { useAuthStore } from '../../auth/authStore';
import { useRobotStore } from '../../robots/robotStore';
import { useRecentEventsStore } from '../recentEventsStore';
import { applyRealtimeMessage } from '../../../shared/realtime/realtimeHandlers';
import { parseTopicMessage } from '../../../shared/realtime/topicRouter';
import type { LogEntry } from '../types';
import { RecentEventsPanel } from './RecentEventsPanel';

vi.mock('../api', () => ({ getLogs: vi.fn() }));

describe('RecentEventsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetStores();
    env.enableMockLogs = false;
    vi.mocked(getLogs).mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('실제 모드에서는 로그 API로 선택 로봇의 초기 이벤트를 조회한다', async () => {
    vi.mocked(getLogs).mockResolvedValueOnce([{
      id: 'actual-event', robotId: 'MOWER-01', severity: 'warning', eventType: 'sensor-fault',
      message: '실제 수신 경고', occurredAt: '2026-09-10T00:00:00Z', source: 'server',
    }]);
    render(<RecentEventsPanel />);
    expect(await screen.findByText('실제 수신 경고')).toBeInTheDocument();
    expect(getLogs).toHaveBeenCalledWith({ robotId: 'MOWER-01', severity: 'all', text: '', from: '', to: '' });
  });

  it('명시적 샘플 모드에서는 선택한 장비의 샘플 이벤트를 표시한다', async () => {
    env.enableMockLogs = true;
    vi.mocked(getLogs).mockResolvedValueOnce(mockLogEntries);
    render(<RecentEventsPanel />);

    expect(screen.getByRole('heading', { name: '최근 경고 및 이벤트' })).toBeInTheDocument();
    expect(await screen.findByText('obstacle-detected')).toBeInTheDocument();
    expect(screen.getByText('샘플 이벤트')).toBeInTheDocument();
    expect(screen.getByText('sensor-fault')).toBeInTheDocument();
    expect(screen.queryByText('communication-lost')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/logs');
  });

  it('조회 중 수신한 STOMP 이벤트를 초기 목록과 ID로 합치고 최신 3건을 표시한다', async () => {
    let resolve!: (events: LogEntry[]) => void;
    vi.mocked(getLogs).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<RecentEventsPanel />);
    const live = event('live', 'MOWER-01', '2026-09-10T00:00:05Z');
    act(() => {
      const parsed = parseTopicMessage('/topic/robots/MOWER-01/events', JSON.stringify(live));
      applyRealtimeMessage(parsed);
      applyRealtimeMessage(parsed);
    });
    await act(async () => resolve([
      { ...live, message: '늦은 API 중복' },
      event('second', 'MOWER-01', '2026-09-10T00:00:04'),
      event('third', 'MOWER-01', '2026-09-10T00:00:03Z'),
      event('old', 'MOWER-01', '2026-09-10T00:00:00Z'),
      event('other', 'MOWER-02', '2026-09-10T00:00:06Z'),
    ]));
    expect(screen.getAllByRole('article').map((article) => article.querySelector('p')?.textContent)).toEqual(['live', 'second', 'third']);
    expect(screen.queryByText('늦은 API 중복')).not.toBeInTheDocument();
  });

  it.each([false, true])('로봇 전환 후 돌아와도 이전 요청의 늦은 응답을 무시한다: 오류=%s', async (fails) => {
    let finish!: () => void;
    vi.mocked(getLogs).mockReturnValueOnce(new Promise((resolve, reject) => {
      finish = () => fails ? reject(new Error('old error')) : resolve([event('old A')]);
    }));
    vi.mocked(getLogs).mockResolvedValueOnce([event('current B', 'MOWER-02')]);
    vi.mocked(getLogs).mockResolvedValueOnce([event('new A')]);
    render(<RecentEventsPanel />);
    act(() => useRobotStore.getState().selectRobot('MOWER-02'));
    expect(await screen.findByText('current B')).toBeInTheDocument();
    act(() => useRobotStore.getState().selectRobot('MOWER-01'));
    expect(await screen.findByText('new A')).toBeInTheDocument();
    await act(async () => finish());
    expect(screen.queryByText('old A')).not.toBeInTheDocument();
    expect(screen.queryByText('current B')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('조회 실패와 빈 결과를 구분하고 오류가 있어도 수신 이벤트는 유지한다', async () => {
    vi.mocked(getLogs).mockRejectedValueOnce(new Error('offline'));
    render(<RecentEventsPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('최근 이벤트를 불러오지 못했습니다.');
    expect(screen.queryByText('최근 이벤트가 없습니다.')).not.toBeInTheDocument();
    act(() => applyRealtimeMessage(parseTopicMessage('/topic/robots/MOWER-01/events', JSON.stringify(event('received')))));
    expect(screen.getByText('received')).toBeInTheDocument();
    expect(screen.getByText('실제 이벤트')).toBeInTheDocument();
  });

  it('실제 조회 결과가 비어 있으면 샘플 대신 빈 목록을 표시한다', async () => {
    render(<RecentEventsPanel />);
    expect(await screen.findByText('최근 이벤트가 없습니다.')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('로그아웃은 최근 이벤트를 지우고 늦은 초기 조회가 다시 채우지 못하게 한다', async () => {
    let resolve!: (events: LogEntry[]) => void;
    vi.mocked(getLogs).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<RecentEventsPanel />);
    act(() => useRecentEventsStore.getState().mergeEvents('MOWER-01', [event('before logout')]));
    await act(async () => {
      useAuthStore.getState().clearSession();
      resolve([event('late')]);
    });
    expect(useRecentEventsStore.getState().eventsByRobotId).toEqual({});
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByText('로그인이 필요합니다.')).toBeInTheDocument();
  });
});

function event(id: string, robotId = 'MOWER-01', occurredAt = '2026-09-10T00:00:00Z'): LogEntry {
  return { id, robotId, occurredAt, severity: 'warning', eventType: 'sensor-fault', message: id, source: 'server' };
}
