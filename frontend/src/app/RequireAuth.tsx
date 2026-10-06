import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../features/auth/authStore';

export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword);
  const { pathname } = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (mustChangePassword && pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}
