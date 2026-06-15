import { beforeEach, describe, expect, it, vi } from 'vitest';

const clearSession = vi.fn();

vi.mock('../config/env', () => ({
  env: {
    apiBaseUrl: '',
  },
}));

vi.mock('../../features/auth/authStore', () => ({
  getAccessToken: () => 'expired-token',
  useAuthStore: {
    getState: () => ({
      clearSession,
    }),
  },
}));

import { httpClient } from './httpClient';

describe('httpClient', () => {
  beforeEach(() => {
    clearSession.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 401,
          statusText: 'Unauthorized',
        }),
      ),
    );
  });

  it('인증 요청이 401이면 저장된 로그인 세션을 제거한다', async () => {
    await expect(httpClient.get('/api/robots')).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });

    expect(clearSession).toHaveBeenCalledTimes(1);
  });
});
