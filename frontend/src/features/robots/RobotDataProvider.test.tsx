import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore';
import { useRobotStore } from './robotStore';
import { RobotDataProvider } from './RobotDataProvider';
import { RobotList } from './components/RobotList';
import { getRobots } from './api';
import type { Robot } from './types';

vi.mock('../../shared/config/env', () => ({
  env: {
    enableMockRobots: false,
    apiBaseUrl: '',
  },
}));

vi.mock('./api', () => ({
  getRobots: vi.fn(async () => [
    {
      id: 'MOWER-01',
      modelName: 'Jetson Orin Local Integration Mock',
      connectionState: 'offline',
      active: true,
    },
  ]),
}));

function Wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('RobotDataProvider', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'admin', name: 'admin', role: 'admin' },
      accessToken: 'token',
      isAuthenticated: true,
    });
    useRobotStore.setState({
      robots: [],
      selectedRobotId: null,
    });
  });

  it('조회 실패를 표시하고 샘플 로봇으로 대체하지 않는다', async () => {
    vi.mocked(getRobots).mockRejectedValueOnce(new Error('offline'));
    render(<Wrapper><RobotDataProvider><RobotList /></RobotDataProvider></Wrapper>);
    expect(await screen.findByRole('alert')).toHaveTextContent('로봇 목록을 불러오지 못했습니다.');
    expect(useRobotStore.getState().robots).toEqual([]);
    expect(useRobotStore.getState().selectedRobotId).toBeNull();
  });

  it('로그아웃 뒤 완료된 조회가 로봇 목록을 다시 채우지 않는다', async () => {
    let resolve!: (robots: Robot[]) => void;
    vi.mocked(getRobots).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<Wrapper><RobotDataProvider><RobotList /></RobotDataProvider></Wrapper>);
    await waitFor(() => expect(getRobots).toHaveBeenCalled());
    await act(async () => {
      useAuthStore.getState().clearSession();
      resolve([{ id: 'old', modelName: 'old', active: true, connectionState: 'offline' }]);
    });
    expect(useRobotStore.getState().robots).toEqual([]);
  });

  it('로그인된 실제 모드에서 /api/robots 결과를 robot store에 반영한다', async () => {
    render(
      <Wrapper>
        <RobotDataProvider>
          <div>content</div>
        </RobotDataProvider>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(useRobotStore.getState().robots).toHaveLength(1);
    });
    expect(useRobotStore.getState().selectedRobotId).toBe('MOWER-01');
  });
});
