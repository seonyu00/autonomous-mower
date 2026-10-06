import { httpClient } from '../../shared/api/httpClient';
import { env } from '../../shared/config/env';
import type { AuthUser, Role } from './types';
import { ApiError } from '../../shared/api/errors';
import { useAuthStore } from './authStore';
import { hasPermission } from '../../shared/lib/permissions';
import type { Permission } from './types';

export type LoginRequest = {
  adminId: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

export async function login(request: LoginRequest): Promise<LoginResponse> {
  if (import.meta.env.DEV && env.enableMockAuth) {
    return {
      accessToken: 'mock-access-token',
      user: {
        id: request.adminId,
        name: request.adminId.toUpperCase(),
        role: 'admin' satisfies Role,
      },
    };
  }

  return httpClient.post<LoginResponse>('/api/auth/login', request, { skipAuth: true });
}

export async function getProfile(): Promise<AuthUser> {
  if (env.enableMockAuth) {
    const user = useAuthStore.getState().user;
    if (!user) throw new ApiError('로그인이 필요합니다.', 'auth');
    const permissions: Permission[] = ['robots:read', 'telemetry:read', 'history:read', 'logs:read', 'settings:read', 'control:write', 'control:takeover', 'accounts:read', 'accounts:write'];
    return { ...user, permissions: permissions.filter((permission) => hasPermission(user.role, permission)) };
  }
  return httpClient.get<AuthUser>('/api/auth/me');
}

export function changePassword(currentPassword: string, newPassword: string) {
  if (env.enableMockAuth) throw new ApiError('샘플 계정의 비밀번호는 변경할 수 없습니다.', 'forbidden');
  return httpClient.put<{ requiresLogin: boolean }>('/api/auth/password', { currentPassword, newPassword });
}
