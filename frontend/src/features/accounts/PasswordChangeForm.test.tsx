import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PasswordChangeForm } from './PasswordChangeForm';
import { validateNewPassword } from './passwordPolicy';
import { changePassword } from '../auth/api';
import { resetStores } from '../../test/testStores';
import { useAuthStore } from '../auth/authStore';
import { env } from '../../shared/config/env';

vi.mock('../auth/api', () => ({ changePassword: vi.fn() }));
beforeEach(() => { resetStores(); env.enableMockAuth = false; vi.clearAllMocks(); });
afterEach(cleanup);

it('비밀번호 글자 수와 UTF-8 바이트 한도를 구분한다', () => {
  expect(validateNewPassword('123456789')).toBe(false);
  expect(validateNewPassword('1234567890')).toBe(true);
  expect(validateNewPassword('가'.repeat(24))).toBe(true);
  expect(validateNewPassword('가'.repeat(25))).toBe(false);
  expect(validateNewPassword('😀'.repeat(9))).toBe(false);
  expect(validateNewPassword('😀'.repeat(10))).toBe(true);
});

it('실패하면 입력을 유지하며 성공하면 세션을 비우고 로그인으로 이동한다', async () => {
  vi.mocked(changePassword).mockRejectedValueOnce(new Error('현재 비밀번호를 확인하세요.')).mockResolvedValueOnce({ requiresLogin: true });
  render(<MemoryRouter initialEntries={['/settings']}><Routes><Route path="/settings" element={<PasswordChangeForm />} /><Route path="/login" element={<p>로그인 화면</p>} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'old-test-password' } });
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'new-test-password' } });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'new-test-password' } });
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('새 비밀번호')).toHaveValue('new-test-password');
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));
  await screen.findByText('로그인 화면');
  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});
