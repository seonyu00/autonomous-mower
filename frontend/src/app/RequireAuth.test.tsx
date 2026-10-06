import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '../features/auth/authStore';
import { RequireAuth } from './RequireAuth';

describe('RequireAuth', () => {
  afterEach(cleanup);

  it('임시 비밀번호 로그인은 관제 대신 비밀번호 변경 화면으로 이동한다', async () => {
    useAuthStore.setState({ user: { id: 'temporary', name: 'temporary', role: 'operator', mustChangePassword: true }, accessToken: 'test', isAuthenticated: true });
    render(<MemoryRouter initialEntries={['/map']}><Routes><Route element={<RequireAuth />}><Route path="/map" element={<p>관제 화면</p>} /><Route path="/change-password" element={<p>비밀번호 변경 화면</p>} /></Route></Routes></MemoryRouter>);
    expect(await screen.findByText('비밀번호 변경 화면')).toBeInTheDocument();
    expect(screen.queryByText('관제 화면')).not.toBeInTheDocument();
  });

  it('인증되지 않은 사용자를 로그인 화면으로 이동시킨다', async () => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    });

    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/map" element={<p>관제 화면</p>} />
          </Route>
          <Route path="/login" element={<p>로그인 화면</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('로그인 화면')).toBeInTheDocument();
    expect(screen.queryByText('관제 화면')).not.toBeInTheDocument();
  });
});
