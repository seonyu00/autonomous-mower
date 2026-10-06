export type ApiErrorKind = 'auth' | 'forbidden' | 'validation' | 'network' | 'server' | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, kind: ApiErrorKind = 'unknown', status?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function classifyStatus(status: number): ApiErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status >= 400 && status < 500) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}
