import { create } from 'zustand';
import type { AuthUser, Role } from './types';

type AuthStore = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setSession: (user: AuthUser, accessToken: string) => void;
  loginAsMock: (role?: Role) => void;
  clearSession: () => void;
};

const mockUser: AuthUser = {
  id: 'admin',
  name: 'ADMIN USER',
  role: 'admin',
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: mockUser,
  accessToken: 'mock-access-token',
  isAuthenticated: true,
  setSession: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
  loginAsMock: (role = 'admin') =>
    set({
      user: { ...mockUser, role },
      accessToken: 'mock-access-token',
      isAuthenticated: true,
    }),
  clearSession: () => set({ user: null, accessToken: null, isAuthenticated: false }),
}));

export function getAccessToken() {
  return useAuthStore.getState().accessToken;
}
