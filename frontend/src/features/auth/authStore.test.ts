import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../shared/config/env', () => ({
  env: {
    enableMockAuth: false,
  },
}));

describe('authStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it('로그인 세션을 sessionStorage에 저장하고 새 store 초기화 시 복원한다', async () => {
    const { useAuthStore } = await import('./authStore');

    useAuthStore.getState().setSession(
      {
        id: 'admin',
        name: 'admin',
        role: 'admin',
      },
      'test-token',
    );

    vi.resetModules();
    const reloaded = await import('./authStore');

    expect(reloaded.useAuthStore.getState().accessToken).toBe('test-token');
    expect(reloaded.useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
