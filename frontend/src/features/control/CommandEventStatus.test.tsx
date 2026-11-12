import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { useControlStore } from './controlStore';
import { CommandEventStatus } from './CommandEventStatus';

describe('CommandEventStatus', () => {
  afterEach(cleanup);
  beforeEach(() => {
    resetStores();
  });

  it('shows the latest command timeout and reason', () => {
    useControlStore.getState().applyCommandEvent({
      robotId: TEST_ROBOT_ID,
      commandId: 'cmd-001',
      commandType: 'manual-command',
      status: 'edge-timeout',
      reason: 'ack-timeout',
      requestedBy: 'admin',
      serverTimestamp: '2026-06-13T01:00:05Z',
      edgeAckAt: null,
    });

    render(<CommandEventStatus robotId={TEST_ROBOT_ID} />);

    expect(screen.getByText(/명령 응답 시간 초과.*ack-timeout/)).toBeInTheDocument();
  });

  it('반복 수동 명령의 일반 상태는 같은 문구로 유지하고 오류는 표시한다', () => {
    const event = { robotId: TEST_ROBOT_ID, commandId: 'manual-1', commandType: 'manual-command',
      requestedBy: 'admin', serverTimestamp: '2026-11-12T01:00:00Z', edgeAckAt: null, reason: null };
    useControlStore.getState().applyCommandEvent({ ...event, status: 'accepted' });
    const view = render(<CommandEventStatus robotId={TEST_ROBOT_ID} />);
    expect(screen.getByText('수동 명령 상태 · 실제 동작 미확인')).toBeInTheDocument();
    act(() => useControlStore.getState().applyCommandEvent({ ...event, status: 'edge-ack' }));
    view.rerender(<CommandEventStatus robotId={TEST_ROBOT_ID} />);
    expect(screen.getByText('수동 명령 상태 · 실제 동작 미확인')).toBeInTheDocument();
    act(() => useControlStore.getState().applyCommandEvent({ ...event, status: 'failed', reason: 'manual-not-armed' }));
    expect(screen.getByText(/명령 실패.*manual-not-armed/)).toBeInTheDocument();
  });
});
