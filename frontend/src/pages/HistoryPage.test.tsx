import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetStores } from '../test/testStores';
import { useRobotStore } from '../features/robots/robotStore';
import { env } from '../shared/config/env';
import { HistoryPage } from './HistoryPage';
import { getHistory } from '../features/history/api';
import { mockHistoryEntries } from '../features/history/mockHistory';
import type { HistoryEntry } from '../features/history/types';
import { useAuthStore } from '../features/auth/authStore';

vi.mock('../features/history/api', () => ({ getHistory: vi.fn() }));

vi.mock('../features/history/components/HistoryMap', () => ({ HistoryMap: () => null }));
vi.mock('../features/history/components/HistoryTimeline', () => ({ HistoryTimeline: () => null }));

beforeEach(() => { resetStores(); env.enableMockHistory = false; vi.mocked(getHistory).mockReset().mockResolvedValue([]); });
afterEach(cleanup);

it('실제 이력은 조회 전 샘플 결과가 없고 로봇 선택은 현재 목록을 따른다', () => {
  useRobotStore.getState().setRobots([]);
  render(<HistoryPage />);
  expect(screen.getByText('0건')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '검색' })).toBeDisabled();
  act(() => useRobotStore.getState().setRobots([{ id: 'actual', modelName: 'actual', active: true, connectionState: 'offline' }]));
  expect(screen.getByRole('combobox')).toHaveValue('actual');
  expect(screen.getByRole('button', { name: '검색' })).toBeEnabled();
  expect(screen.queryByText('샘플 데이터')).not.toBeInTheDocument();
});

it('명시적인 개발 이력 Mock은 기존 샘플을 표시한다', () => {
  env.enableMockHistory = true;
  render(<HistoryPage />);
  expect(screen.getByText('샘플 데이터')).toBeInTheDocument();
  expect(screen.queryByText('0건')).not.toBeInTheDocument();
});

function deferred() {
  let resolve!: (value: HistoryEntry[]) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<HistoryEntry[]>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

it('조회 중, 미집계 값과 실제 결과를 표시한다', async () => {
  const pending = deferred();
  vi.mocked(getHistory).mockReturnValue(pending.promise);
  render(<HistoryPage />);
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
  await act(async () => pending.resolve([{ ...mockHistoryEntries[0], distanceMeters: null, coveragePercent: null }]));
  expect(screen.getByText('실제 이력')).toBeInTheDocument();
  expect(screen.getByText('거리 미집계 | 커버리지 미집계')).toBeInTheDocument();
  expect(screen.getByText('1건')).toBeInTheDocument();
});

it.each(['success', 'error'])('늦은 이전 검색 %s 응답이 최신 검색을 덮지 않는다', async (outcome) => {
  const first = deferred();
  const second = deferred();
  vi.mocked(getHistory).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(<HistoryPage />);
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await act(async () => second.resolve([{ ...mockHistoryEntries[0], distanceMeters: 1234 }]));
  await act(async () => outcome === 'success' ? first.resolve([]) : first.reject(new Error('old error')));
  expect(screen.getByText(/1234 m/)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('조회 오류와 빈 결과를 구분하고 재검색할 수 있다', async () => {
  vi.mocked(getHistory).mockRejectedValueOnce(new Error('조회 실패')).mockResolvedValueOnce([]);
  render(<HistoryPage />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '검색' })));
  expect(screen.getByRole('alert')).toHaveTextContent('조회 실패');
  expect(screen.queryByText('선택한 조건에 맞는 작업 이력이 없습니다.')).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '검색' })));
  expect(screen.getByText('선택한 조건에 맞는 작업 이력이 없습니다.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['robot', 'date', 'logout'])('%s 변경 뒤 이전 응답은 표시하지 않는다', async (change) => {
  const pending = deferred();
  vi.mocked(getHistory).mockReturnValueOnce(pending.promise);
  render(<HistoryPage />);
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  if (change === 'robot') fireEvent.change(screen.getByRole('combobox'), { target: { value: 'MOWER-02' } });
  if (change === 'date') fireEvent.change(screen.getByLabelText('시작일 (UTC)'), { target: { value: '2026-09-10' } });
  if (change === 'logout') act(() => useAuthStore.getState().clearSession());
  await act(async () => pending.resolve([{ ...mockHistoryEntries[0], distanceMeters: 9999 }]));
  expect(screen.queryByText(/9999 m/)).not.toBeInTheDocument();
});
