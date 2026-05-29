import { useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { AuthUser } from '../../features/auth/types';
import { AuthContext } from './authContext';
import type { AuthContextValue } from './authContext';

const mockUser: AuthUser = {
  id: 'admin',
  name: 'ADMIN USER',
  role: 'admin',
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(mockUser);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      loginAsMock: (role = 'admin') => {
        setUser({ ...mockUser, role });
      },
      logout: () => setUser(null),
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
