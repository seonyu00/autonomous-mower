import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { useAuthStore } from '../features/auth/authStore';
import { resetStores } from '../test/testStores';
import { getProfile } from '../features/auth/api';
import { accountApi } from '../features/accounts/api';
import { env } from '../shared/config/env';
import { ApiError } from '../shared/api/errors';

vi.mock('../features/auth/api', () => ({ getProfile: vi.fn(), changePassword: vi.fn() }));
vi.mock('../features/accounts/api', async (original) => ({ ...await original<object>(), accountApi: { list: vi.fn(), audit: vi.fn(), create: vi.fn(), update: vi.fn(), get: vi.fn(), resetPassword: vi.fn() } }));

const account = { adminId: 'operator-test', role: 'operator' as const, enabled: true, version: 2, mustChangePassword: false, createdAt: '2026-10-05T01:00:00Z', updatedAt: '2026-10-05T01:00:00Z' };
function show() { render(<MemoryRouter><SettingsPage /></MemoryRouter>); }
beforeEach(() => {
  resetStores(); env.enableMockAuth = false; vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue({ id: 'admin', name: '관리자', role: 'admin', permissions: ['settings:read', 'accounts:read', 'accounts:write'] });
  vi.mocked(accountApi.list).mockResolvedValue({ items: [account], page: 0, size: 20, totalElements: 1, totalPages: 1 });
  vi.mocked(accountApi.audit).mockResolvedValue({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
});
afterEach(cleanup);

it('일반 사용자는 자기 계정만 조회하고 관리 API를 호출하지 않는다', async () => {
  vi.mocked(getProfile).mockResolvedValue({ id: 'viewer', name: '조회', role: 'read-only', permissions: ['settings:read'] });
  show();
  expect(await screen.findByText('viewer')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '계정 관리' })).not.toBeInTheDocument();
  expect(accountApi.list).not.toHaveBeenCalled();
});

it('샘플 관리자도 실제 계정을 변경하는 화면과 요청을 이용할 수 없다', async () => {
  env.enableMockAuth = true; show();
  await screen.findByText('admin');
  expect(screen.getByText(/샘플 계정입니다/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '새 계정' })).not.toBeInTheDocument();
  expect(accountApi.list).not.toHaveBeenCalled();
});

it('권한 변경 충돌 시 입력을 유지하고 명시적으로 최신 버전을 다시 읽는다', async () => {
  vi.mocked(accountApi.update).mockRejectedValue(new ApiError('최신 정보를 다시 조회하세요.', 'validation', 409, 'ACCOUNT_VERSION_CONFLICT'));
  vi.mocked(accountApi.get).mockResolvedValue({ ...account, version: 3 });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'operator-test 관리' }));
  fireEvent.change(screen.getByLabelText('변경할 역할'), { target: { value: 'read-only' } });
  fireEvent.click(screen.getByLabelText('대상 계정의 모든 로그인 세션이 종료됨을 확인했습니다.'));
  fireEvent.click(screen.getByRole('button', { name: '권한·상태 저장' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('변경할 역할')).toHaveValue('read-only');
  fireEvent.click(screen.getByRole('button', { name: '최신 정보 다시 조회' }));
  await screen.findByText(/최신 정보를 조회했습니다/);
  expect(screen.getByLabelText('변경할 역할')).toHaveValue('read-only');
  expect(screen.getByRole('button', { name: '권한·상태 저장' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('대상 계정의 모든 로그인 세션이 종료됨을 확인했습니다.'));
  fireEvent.click(screen.getByRole('button', { name: '권한·상태 저장' }));
  await waitFor(() => expect(accountApi.update).toHaveBeenLastCalledWith(expect.objectContaining({ version: 3 }), { role: 'read-only', enabled: true }));
});

it('새 ID는 최대 20자로 제한하며 9자 비밀번호는 서버 요청 전에 거부한다', async () => {
  show(); fireEvent.click(await screen.findByRole('button', { name: '새 계정' }));
  expect(screen.getByLabelText('새 계정 ID')).toHaveAttribute('maxlength', '20');
  fireEvent.change(screen.getByLabelText('새 계정 ID'), { target: { value: 'new-account' } });
  fireEvent.change(screen.getByLabelText('임시 비밀번호'), { target: { value: '123456789' } });
  fireEvent.click(screen.getByRole('button', { name: '계정 생성' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('최소 10자');
  expect(accountApi.create).not.toHaveBeenCalled();
  vi.mocked(accountApi.create).mockResolvedValue({ ...account, adminId: 'new-account', mustChangePassword: true });
  fireEvent.change(screen.getByLabelText('임시 비밀번호'), { target: { value: '1234567890' } });
  fireEvent.click(screen.getByRole('button', { name: '계정 생성' }));
  await screen.findByText(/계정을 생성했습니다/);
  expect(accountApi.create).toHaveBeenCalledWith({ adminId: 'new-account', role: 'read-only', temporaryPassword: '1234567890' });
  expect(screen.queryByDisplayValue('1234567890')).not.toBeInTheDocument();
});

it('이전 세션의 늦은 계정 정보로 관리 화면을 복원하지 않는다', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof getProfile>>) => void;
  vi.mocked(getProfile).mockReturnValue(new Promise((done) => { resolve = done; }));
  show();
  act(() => useAuthStore.getState().clearSession());
  await act(async () => resolve({ id: 'old-admin', name: 'old', role: 'admin', permissions: ['accounts:read'] }));
  expect(screen.queryByText('old-admin')).not.toBeInTheDocument();
  expect(accountApi.list).not.toHaveBeenCalled();
});
