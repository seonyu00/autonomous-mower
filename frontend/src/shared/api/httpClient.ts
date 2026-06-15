import { env } from '../config/env';
import { ApiError, classifyStatus } from './errors';
import { getAccessToken, useAuthStore } from '../../features/auth/authStore';

type RequestOptions = RequestInit & {
  token?: string;
  skipAuth?: boolean;
  responseType?: 'json' | 'blob';
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { responseType = 'json', ...fetchOptions } = options;
  const headers = new Headers(options.headers);
  headers.set('Accept', responseType === 'blob' ? 'image/jpeg' : 'application/json');

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const accessToken = options.token ?? (options.skipAuth ? null : getAccessToken());

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response: Response;

  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...fetchOptions,
      headers,
    });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : '네트워크 요청을 보내지 못했습니다.', 'network');
  }

  if (!response.ok) {
    if (response.status === 401 && !options.skipAuth) {
      useAuthStore.getState().clearSession();
    }

    throw new ApiError(response.statusText || '요청을 처리하지 못했습니다.', classifyStatus(response.status), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (responseType === 'blob') {
    return (await response.blob()) as T;
  }

  const json = (await response.json()) as T | ApiEnvelope<T>;

  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return (json as ApiEnvelope<T>).data as T;
  }

  return json as T;
}

export const httpClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, body: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  getBlob: (path: string, options?: RequestOptions) =>
    request<Blob>(path, { ...options, method: 'GET', responseType: 'blob' }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
};
