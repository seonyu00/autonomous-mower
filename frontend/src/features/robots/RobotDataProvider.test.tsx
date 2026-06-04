import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore';
import { useRobotStore } from './robotStore';
import { RobotDataProvider } from './RobotDataProvider';

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
  beforeEach(() => {
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
