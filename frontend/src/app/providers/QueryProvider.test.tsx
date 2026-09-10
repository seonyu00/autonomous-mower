import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useAuthStore } from '../../features/auth/authStore';
import { QueryProvider } from './QueryProvider';

it('로그아웃 시 조회·변경 캐시를 제거하고 다음 세션은 빈 캐시로 시작한다', () => {
  let client!: QueryClient;
  function Probe() { client = useQueryClient(); return null; }
  render(<QueryProvider><Probe /></QueryProvider>);
  client.setQueryData(['robots'], [{ id: 'old' }]);
  client.setQueryData(['logs'], [{ id: 'old-log' }]);
  client.getMutationCache().build(client, { mutationKey: ['old-command'] });
  act(() => useAuthStore.getState().clearSession());
  expect(client.getQueryCache().getAll()).toEqual([]);
  expect(client.getMutationCache().getAll()).toEqual([]);
  act(() => useAuthStore.getState().setSession({ id: 'next', name: 'next', role: 'admin' }, 'next-token'));
  expect(client.getQueryData(['robots'])).toBeUndefined();
});
