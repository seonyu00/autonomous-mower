import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetStores } from '../test/testStores';
import { useRobotStore } from '../features/robots/robotStore';
import { env } from '../shared/config/env';
import { HistoryPage } from './HistoryPage';

vi.mock('../features/history/components/HistoryMap', () => ({ HistoryMap: () => null }));
vi.mock('../features/history/components/HistoryTimeline', () => ({ HistoryTimeline: () => null }));

beforeEach(() => { resetStores(); env.enableMockHistory = false; });
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
