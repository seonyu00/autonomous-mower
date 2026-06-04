import { create } from 'zustand';
import { env } from '../../shared/config/env';
import type { AuthUser, Role } from './types';

type AuthStore = {
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

    if (!parsed.user || !parsed.accessToken) {
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
  user: env.enableMockAuth ? mockUser : storedSession?.user ?? null,
  accessToken: env.enableMockAuth ? 'mock-access-token' : storedSession?.accessToken ?? null,
  isAuthenticated: env.enableMockAuth || Boolean(storedSession),
  setSession: (user, accessToken) => {
    writeStoredSession(user, accessToken);
    set({ user, accessToken, isAuthenticated: true });
  },
  loginAsMock: (role = 'admin') =>
    set({
      user: { ...mockUser, role },
      accessToken: 'mock-access-token',
      isAuthenticated: true,
    }),
  clearSession: () => {
    removeStoredSession();
    set({ user: null, accessToken: null, isAuthenticated: false });
  },
}));

export function getAccessToken() {
  return useAuthStore.getState().accessToken;
}
