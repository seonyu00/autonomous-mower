import type { PropsWithChildren } from 'react';
import { AuthContext } from './authContext';
import { useAuthStore } from '../../features/auth/authStore';

export function AuthProvider({ children }: PropsWithChildren) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loginAsMock = useAuthStore((state) => state.loginAsMock);
  const clearSession = useAuthStore((state) => state.clearSession);

  const value = {
    user,
    accessToken,
    isAuthenticated,
    loginAsMock,
    logout: clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
