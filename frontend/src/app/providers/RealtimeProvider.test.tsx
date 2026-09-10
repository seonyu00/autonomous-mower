import type { PropsWithChildren } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useControlStore } from '../../features/control/controlStore';
import { useTelemetryStore } from '../../features/telemetry/telemetryStore';
import { resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { useAuthStore } from '../../features/auth/authStore';
import { fetchCurrentControlState } from '../../features/control/controlStateApi';
import { env } from '../../shared/config/env';

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
  afterEach(cleanup);
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

  it('로그아웃 후 이전 구독의 메시지와 연결 상태를 무시한다', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(realtimeMock.activate).toHaveBeenCalled());
    const handlers = realtimeMock.handlers;
    const onStateChange = realtimeMock.options?.onStateChange as (state: string) => void;
    act(() => useAuthStore.getState().clearSession());
    act(() => {
      handlers?.telemetry({ destination: '', body: JSON.stringify({ robotId: TEST_ROBOT_ID, batteryLevel: 99 }) });
      onStateChange('connected');
    });
    expect(useTelemetryStore.getState().telemetryByRobotId).toEqual({});
    expect(useTelemetryStore.getState().connectionState).toBe('disconnected');
    expect(realtimeMock.deactivate).toHaveBeenCalled();
  });

  it('로그아웃 후 제어 상태 조회가 완료돼도 복원하거나 연결하지 않는다', async () => {
    let resolve!: (snapshot: Awaited<ReturnType<typeof fetchCurrentControlState>>) => void;
    vi.mocked(fetchCurrentControlState).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<Wrapper />);
    await act(async () => {
      useAuthStore.getState().clearSession();
      resolve({ robotId: TEST_ROBOT_ID, lockState: 'held' } as Awaited<ReturnType<typeof fetchCurrentControlState>>);
    });
    expect(useControlStore.getState().controlByRobotId).toEqual({});
    expect(realtimeMock.activate).not.toHaveBeenCalled();
  });

  it('명시적으로 켠 개발 Mock은 샘플 텔레메트리를 공급한다', () => {
    env.enableMockRealtime = true;
    useTelemetryStore.setState({ telemetryByRobotId: {}, dataSource: 'real' });
    const view = render(<Wrapper />);
    expect(useTelemetryStore.getState().dataSource).toBe('mock');
    expect(useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID]).toBeDefined();
    expect(fetchCurrentControlState).not.toHaveBeenCalled();
    expect(realtimeMock.options?.enabled).toBe(false);
    view.unmount();
    env.enableMockRealtime = false;
  });
});
