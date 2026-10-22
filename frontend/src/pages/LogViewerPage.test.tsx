import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getLogs: vi.fn() }));
vi.mock('../features/logs/api', () => ({ getLogs: mocks.getLogs }));
vi.mock('../shared/config/env', () => ({ env: { enableMockLogs: false } }));
vi.mock('../features/logs/components/SnapshotViewer', () => ({
  SnapshotViewer: ({ log }: { log: { id: string } }) => <div data-testid="selected-snapshot">{log.id}</div>,
}));

import { LogViewerPage } from './LogViewerPage';
import { useRobotStore } from '../features/robots/robotStore';

beforeEach(() => {
  mocks.getLogs.mockReset();
  mocks.getLogs.mockResolvedValue([]);
  useRobotStore.setState(useRobotStore.getInitialState(), true);
});

afterEach(cleanup);

it('실제 모드의 로봇 필터는 조회한 장비만 표시한다', () => {
  useRobotStore.getState().setRobots([{
    id: 'PC-INTEGRATION', modelName: '통합 검증 장비', connectionState: 'offline', active: true,
  }]);
  render(<LogViewerPage />);
  expect(screen.getByRole('option', { name: 'PC-INTEGRATION' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'MOWER-01' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('로봇'), { target: { value: 'PC-INTEGRATION' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(mocks.getLogs).toHaveBeenCalledWith(expect.objectContaining({ robotId: 'PC-INTEGRATION' }));
});

it('keeps the previous result and displays a failed date search', async () => {
  mocks.getLogs.mockResolvedValueOnce([{
    id: 'log-1', robotId: 'MOWER-01', severity: 'critical', eventType: 'estop',
    message: '유지할 로그', occurredAt: '2026-06-15T00:00:00Z', source: 'edge',
  }]).mockRejectedValueOnce(new Error('시작일은 종료일보다 늦을 수 없습니다.'));
  render(<LogViewerPage />);
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByRole('button', { name: /유지할 로그/ });

  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-06-16' } });
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-06-15' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('시작일은 종료일보다 늦을 수 없습니다.'));
  expect(screen.getByRole('button', { name: /유지할 로그/ })).toBeInTheDocument();
  expect(mocks.getLogs).toHaveBeenLastCalledWith({
    robotId: 'all', severity: 'all', text: '', from: '2026-06-16', to: '2026-06-15',
  });
});

it('모든 이벤트를 유지하며 선택한 로그의 전체 메시지와 스냅샷을 상세에 표시한다', async () => {
  const logs = Array.from({ length: 29 }, (_, index) => ({
    id: `log-${index}`, robotId: 'MOWER-01', severity: 'warning', eventType: 'sensor-fault',
    message: `센서 점검 ${index}: 목록에서 요약해도 상세에서 전체 내용을 읽을 수 있는 긴 메시지입니다.`,
    occurredAt: index === 28 ? '2026-06-14T01:00:00Z' : '2026-06-15T01:00:00Z', source: 'edge',
  }));
  mocks.getLogs.mockResolvedValueOnce(logs);
  render(<LogViewerPage />);
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  const list = await screen.findByRole('region', { name: '이벤트 목록' });
  await within(list).findByRole('button', { name: /센서 점검 0:/ });
  expect(within(list).getAllByRole('button')).toHaveLength(29);
  expect(within(list).getAllByRole('heading', { level: 3 })).toHaveLength(2);
  const lastLog = within(list).getByRole('button', { name: /센서 점검 28:/ });
  fireEvent.click(lastLog);
  expect(lastLog).toHaveAttribute('aria-pressed', 'true');
  expect(within(list).getByRole('button', { name: /센서 점검 0:/ })).toHaveAttribute('aria-pressed', 'false');
  const detail = screen.getByRole('region', { name: '선택한 로그 상세' });
  expect(within(detail).getByText(logs[28].message)).toBeInTheDocument();
  expect(within(detail).getByTestId('selected-snapshot')).toHaveTextContent('log-28');
  const metadata = within(detail).getByText('로그 메타데이터 · 원본 JSON').closest('details');
  expect(metadata).not.toHaveAttribute('open');
  fireEvent.click(within(detail).getByText('로그 메타데이터 · 원본 JSON'));
  expect(metadata).toHaveAttribute('open');
  expect(within(detail).getByText(/"id": "log-28"/)).toBeInTheDocument();
});

it('재검색 결과가 비면 이전 선택과 상세를 비운다', async () => {
  mocks.getLogs.mockResolvedValueOnce([{
    id: 'log-1', robotId: 'MOWER-01', severity: 'info', eventType: 'job-event',
    message: '작업 로그', occurredAt: '2026-06-15T00:00:00Z', source: 'edge',
  }]).mockResolvedValueOnce([]);
  render(<LogViewerPage />);
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByRole('button', { name: /작업 로그/ });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByText('선택한 조건에 맞는 로그가 없습니다.');
  expect(screen.queryByTestId('selected-snapshot')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: '선택한 로그 상세' })).toHaveTextContent('목록에서 로그를 선택하면');
});
