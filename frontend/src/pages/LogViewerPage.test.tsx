import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getLogs: vi.fn() }));
vi.mock('../features/logs/api', () => ({ getLogs: mocks.getLogs }));
vi.mock('../shared/config/env', () => ({ env: { enableMockLogs: false } }));
vi.mock('../features/logs/components/SnapshotViewer', () => ({ SnapshotViewer: () => null }));

import { LogViewerPage } from './LogViewerPage';

beforeEach(() => {
  mocks.getLogs.mockReset();
});

it('keeps the previous result and displays a failed date search', async () => {
  mocks.getLogs.mockResolvedValueOnce([{
    id: 'log-1', robotId: 'MOWER-01', severity: 'critical', eventType: 'estop',
    message: '유지할 로그', occurredAt: '2026-06-15T00:00:00Z', source: 'edge',
  }]).mockRejectedValueOnce(new Error('시작일은 종료일보다 늦을 수 없습니다.'));
  render(<LogViewerPage />);
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByText('유지할 로그');

  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-06-16' } });
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-06-15' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('시작일은 종료일보다 늦을 수 없습니다.'));
  expect(screen.getByText('유지할 로그')).toBeInTheDocument();
  expect(mocks.getLogs).toHaveBeenLastCalledWith({
    robotId: 'all', severity: 'all', text: '', from: '2026-06-16', to: '2026-06-15',
  });
});
