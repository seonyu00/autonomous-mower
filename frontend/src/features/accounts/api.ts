import { httpClient } from '../../shared/api/httpClient';
import { env } from '../../shared/config/env';
import { ApiError } from '../../shared/api/errors';
import type { Role } from '../auth/types';

export type Account = {
  adminId: string; role: Role; enabled: boolean; version: number; mustChangePassword: boolean;
  createdAt: string; updatedAt: string;
};
export type Page<T> = { items: T[]; page: number; size: number; totalElements: number; totalPages: number };
export type AccountAudit = {
  id: string; actorId: string; targetId: string; action: string;
  previousRole: Role | null; newRole: Role | null; previousEnabled: boolean | null; newEnabled: boolean | null; occurredAt: string;
};

function requireRealAccount() {
  if (env.enableMockAuth) throw new ApiError('계정 관리는 실제 서버에 로그인한 뒤 사용할 수 있습니다.', 'forbidden');
}

export const accountApi = {
  get: (id: string) => {
    requireRealAccount(); return httpClient.get<Account>(`/api/accounts/${encodeURIComponent(id)}`);
  },
  list: (search = '', page = 0) => {
    requireRealAccount();
    return httpClient.get<Page<Account>>(`/api/accounts?${new URLSearchParams({ search, page: String(page), size: '20' })}`);
  },
  audit: (page = 0) => {
    requireRealAccount();
    return httpClient.get<Page<AccountAudit>>(`/api/accounts/audit?page=${page}&size=20`);
  },
  create: (data: { adminId: string; role: Role; temporaryPassword: string }) => {
    requireRealAccount(); return httpClient.post<Account>('/api/accounts', data);
  },
  update: (account: Account, data: { role: Role; enabled: boolean }) => {
    requireRealAccount(); return httpClient.patch<Account>(`/api/accounts/${encodeURIComponent(account.adminId)}`, { ...data, expectedVersion: account.version });
  },
  resetPassword: (account: Account, data: { currentPassword: string; temporaryPassword: string }) => {
    requireRealAccount(); return httpClient.post<Account>(`/api/accounts/${encodeURIComponent(account.adminId)}/password-reset`, { ...data, expectedVersion: account.version });
  },
};

export const roleLabels: Record<Role, string> = {
  'read-only': '조회 전용', operator: '운용자', supervisor: '상위 관리자', admin: '관리자',
};
