import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { useControlStore } from './controlStore';
import { CommandEventStatus } from './CommandEventStatus';

describe('CommandEventStatus', () => {
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
});
