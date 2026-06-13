import type { PropsWithChildren } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useControlStore } from '../../features/control/controlStore';
import { useTelemetryStore } from '../../features/telemetry/telemetryStore';
import { resetStores, TEST_ROBOT_ID } from '../../test/testStores';

const realtimeMock = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  handlers: null as Record<string, (message: { destination: string; body: string }) => void> | null,
  activate: vi.fn(),
  deactivate: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../../shared/realtime/stompClient', () => ({
  createStompClient: (options: Record<string, unknown>) => {
    realtimeMock.options = options;
    return {
      activate: realtimeMock.activate,
      deactivate: realtimeMock.deactivate,
      subscribe: vi.fn(),
      publish: vi.fn(),
      subscribeToRobotTopics: (
        _robotId: string,
        handlers: Record<string, (message: { destination: string; body: string }) => void>,
      ) => {
        realtimeMock.handlers = handlers;
        return realtimeMock.unsubscribe;
      },
    };
  },
}));

vi.mock('../../shared/config/env', () => ({
  env: {
    wssUrl: 'ws://localhost:8080/ws',
    enableMockRealtime: false,
  },
}));

vi.mock('../../features/control/controlStateApi', () => ({
  fetchCurrentControlState: vi.fn(async () => ({
    robotId: TEST_ROBOT_ID,
    lockState: 'held',
    controlOwner: 'admin',
    controlOwnerName: 'ADMIN USER',
    mode: 'manual',
    emergency: false,
    lockVersion: 9,
    expiresAt: '2026-06-13T01:05:00Z',
    reason: 'claim-control',
    updatedAt: '2026-06-13T01:00:00Z',
  })),
}));

import { RealtimeProvider } from './RealtimeProvider';

function Wrapper({ children }: PropsWithChildren) {
  return <RealtimeProvider>{children}</RealtimeProvider>;
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    resetStores();
    realtimeMock.options = null;
    realtimeMock.handlers = null;
    vi.clearAllMocks();
  });

  it('restores the current lock and wires authenticated realtime handlers', async () => {
    render(<Wrapper><div>content</div></Wrapper>);

    await waitFor(() => {
      expect(useControlStore.getState().getControlState(TEST_ROBOT_ID).lockVersion).toBe(9);
    });

    expect(realtimeMock.options).toMatchObject({
      accessToken: 'test-access-token',
    });

    realtimeMock.handlers?.telemetry({
      destination: `/topic/robots/${TEST_ROBOT_ID}/telemetry`,
      body: JSON.stringify({
        robotId: TEST_ROBOT_ID,
        latitude: 37.5,
        longitude: 127,
        batteryLevel: 99,
        mode: 'idle',
        workState: 'idle',
        speedMps: 0,
        signalStrength: 100,
        lastReceivedAt: '2026-06-13T01:00:00Z',
      }),
    });

    expect(useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID].batteryLevel).toBe(99);
  });
});
