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

  it('실제 모드에서는 Mock 로그인 호출과 저장된 Mock 세션을 허용하지 않는다', async () => {
    sessionStorage.setItem('autonomous-mower.auth-session', JSON.stringify({
      user: { id: 'admin', name: 'ADMIN USER', role: 'admin' }, accessToken: 'mock-access-token',
    }));
    const { useAuthStore } = await import('./authStore');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    useAuthStore.getState().loginAsMock();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(sessionStorage.getItem('autonomous-mower.auth-session')).toBeNull();
  });

  it('로그아웃하면 제어·로봇·텔레메트리·구역·영상 상태를 비운다', async () => {
    const { resetStores, holdControl } = await import('../../test/testStores');
    const { useAuthStore } = await import('./authStore');
    const { useControlStore } = await import('../control/controlStore');
    const { useRobotStore } = await import('../robots/robotStore');
    const { useTelemetryStore } = await import('../telemetry/telemetryStore');
    const { useZoneStore } = await import('../map/zoneStore');
    const { useVideoStore } = await import('../video/videoStore');
    resetStores();
    holdControl();
    useZoneStore.getState().startEditing('MOWER-01', [[127, 37]]);
    useVideoStore.getState().patchSession('MOWER-01', { sessionId: 'old-video' });
    useAuthStore.getState().clearSession();
    expect(useRobotStore.getState().robots).toEqual([]);
    expect(useRobotStore.getState().selectedRobotId).toBeNull();
    expect(useTelemetryStore.getState().telemetryByRobotId).toEqual({});
    expect(useTelemetryStore.getState().statusByRobotId).toEqual({});
    expect(useControlStore.getState().controlByRobotId).toEqual({});
    expect(useZoneStore.getState().draftVerticesByRobotId).toEqual({});
    expect(useVideoStore.getState().sessionsByRobotId).toEqual({});
  });
});
