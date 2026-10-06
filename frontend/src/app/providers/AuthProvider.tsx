import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { getProfile } from '../../features/auth/api';
import { env } from '../../shared/config/env';
import { AuthContext } from './authContext';
import { useAuthStore } from '../../features/auth/authStore';

export function AuthProvider({ children }: PropsWithChildren) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loginAsMock = useAuthStore((state) => state.loginAsMock);
  const clearSession = useAuthStore((state) => state.clearSession);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);

  useEffect(() => {
    if (!accessToken || env.enableMockAuth) return;
    let active = true;
    void getProfile().then((profile) => {
      if (active && useAuthStore.getState().sessionVersion === sessionVersion) useAuthStore.getState().updateProfile(profile);
    }).catch(() => { /* 401 정리는 공통 HTTP 클라이언트가 수행한다. */ });
    return () => { active = false; };
  }, [accessToken, sessionVersion]);

  const value = {
    user,
    accessToken,
    isAuthenticated,
    loginAsMock,
    logout: clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
