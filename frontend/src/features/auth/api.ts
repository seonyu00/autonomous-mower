import { httpClient } from '../../shared/api/httpClient';
import { env } from '../../shared/config/env';
import type { AuthUser, Role } from './types';

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
