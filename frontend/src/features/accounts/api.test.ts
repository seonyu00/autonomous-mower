import { expect, it, vi } from 'vitest';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../shared/api/httpClient', () => ({ httpClient: http }));
vi.mock('../../shared/config/env', () => ({ env: { enableMockAuth: true } }));
import { accountApi } from './api';

it('샘플 로그인으로 실제 계정 목록·감사·생성 API를 호출하지 않는다', () => {
  expect(() => accountApi.list()).toThrow('실제 서버');
  expect(() => accountApi.audit()).toThrow('실제 서버');
  expect(() => accountApi.create({ adminId: 'test', role: 'admin', temporaryPassword: 'test-only-10' })).toThrow('실제 서버');
  expect(http.get).not.toHaveBeenCalled();
  expect(http.post).not.toHaveBeenCalled();
});
