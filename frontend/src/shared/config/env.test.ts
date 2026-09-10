import { afterEach, describe, expect, it, vi } from 'vitest';

const flags = ['AUTH', 'CONTROL', 'ROBOTS', 'REALTIME', 'VIDEO', 'LOGS', 'WORK_ZONE', 'HISTORY'];

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Mock 활성화 경계', () => {
  it.each([undefined, 'false', 'TRUE', '1'])('개발 환경에서도 명시적 true 외에는 비활성화한다: %s', async (value) => {
    vi.stubEnv('DEV', true);
    flags.forEach((flag) => vi.stubEnv(`VITE_ENABLE_MOCK_${flag}`, value));
    const { env } = await import('./env');
    expect(Object.entries(env).filter(([key]) => key.startsWith('enableMock')).every(([, enabled]) => !enabled)).toBe(true);
  });

  it.each([true, false])('명시적으로 켜도 개발 환경에서만 활성화한다: DEV=%s', async (dev) => {
    vi.stubEnv('DEV', dev);
    flags.forEach((flag) => vi.stubEnv(`VITE_ENABLE_MOCK_${flag}`, 'true'));
    const { env } = await import('./env');
    expect(env.enableMockAuth).toBe(dev);
    expect(env.enableMockRealtime).toBe(dev);
    expect(env.enableMockRobots).toBe(dev);
    expect(env.enableMockVideo).toBe(dev);
    expect(env.enableMockControl).toBe(dev);
    expect(env.enableMockWorkZone).toBe(dev);
    expect(env.enableMockLogs).toBe(dev);
    expect(env.enableMockHistory).toBe(dev);
    sessionStorage.clear();
    const { useAuthStore } = await import('../../features/auth/authStore');
    expect(useAuthStore.getState().isAuthenticated).toBe(dev);
    expect(useAuthStore.getState().accessToken).toBe(dev ? 'mock-access-token' : null);
  });
});
