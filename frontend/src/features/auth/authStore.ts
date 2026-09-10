import { create } from 'zustand';
import { env } from '../../shared/config/env';
import { useRobotStore } from '../robots/robotStore';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { useControlStore } from '../control/controlStore';
import { useZoneStore } from '../map/zoneStore';
import { useVideoStore } from '../video/videoStore';
import type { AuthUser, Role } from './types';

type AuthStore = {
  sessionVersion: number;
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setSession: (user: AuthUser, accessToken: string) => void;
  loginAsMock: (role?: Role) => void;
  clearSession: () => void;
};

type StoredSession = {
  user: AuthUser;
  accessToken: string;
};

const AUTH_SESSION_STORAGE_KEY = 'autonomous-mower.auth-session';

const mockUser: AuthUser = {
  id: 'admin',
  name: 'ADMIN USER',
  role: 'admin',
};

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;

    if (!parsed.user || !parsed.accessToken || parsed.accessToken === 'mock-access-token') {
      window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }

    return {
      user: parsed.user,
      accessToken: parsed.accessToken,
    };
  } catch {
    window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(user: AuthUser, accessToken: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ user, accessToken }));
}

function removeStoredSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

const storedSession = env.enableMockAuth ? null : readStoredSession();

export const useAuthStore = create<AuthStore>((set) => ({
  sessionVersion: 0,
  user: env.enableMockAuth ? mockUser : storedSession?.user ?? null,
  accessToken: env.enableMockAuth ? 'mock-access-token' : storedSession?.accessToken ?? null,
  isAuthenticated: env.enableMockAuth || Boolean(storedSession),
  setSession: (user, accessToken) => {
    if (accessToken === 'mock-access-token') {
      if (!env.enableMockAuth) return;
      removeStoredSession();
    } else {
      writeStoredSession(user, accessToken);
    }
    resetDeviceData();
    set((state) => ({ user, accessToken, isAuthenticated: true, sessionVersion: state.sessionVersion + 1 }));
  },
  loginAsMock: (role = 'admin') => {
    if (!env.enableMockAuth) return;
    useAuthStore.getState().setSession({ ...mockUser, role }, 'mock-access-token');
  },
  clearSession: () => {
    removeStoredSession();
    set((state) => ({ user: null, accessToken: null, isAuthenticated: false, sessionVersion: state.sessionVersion + 1 }));
    resetDeviceData();
  },
}));

export function getAccessToken() {
  return useAuthStore.getState().accessToken;
}

function resetDeviceData() {
  useRobotStore.setState(useRobotStore.getInitialState(), true);
  useTelemetryStore.setState(useTelemetryStore.getInitialState(), true);
  useControlStore.setState(useControlStore.getInitialState(), true);
  useZoneStore.setState(useZoneStore.getInitialState(), true);
  useVideoStore.setState(useVideoStore.getInitialState(), true);
}
