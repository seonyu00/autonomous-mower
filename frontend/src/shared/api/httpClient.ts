import { env } from '../config/env';
import { ApiError, classifyStatus } from './errors';
import { getAccessToken } from '../../features/auth/authStore';

type RequestOptions = RequestInit & {
  token?: string;
  skipAuth?: boolean;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const accessToken = options.token ?? (options.skipAuth ? null : getAccessToken());

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response: Response;

  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : '네트워크 요청을 보내지 못했습니다.', 'network');
  }

  if (!response.ok) {
    throw new ApiError(response.statusText || '요청을 처리하지 못했습니다.', classifyStatus(response.status), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
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
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
};
