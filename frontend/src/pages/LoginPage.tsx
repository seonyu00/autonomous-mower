import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/providers/authContext';
import { login } from '../features/auth/api';
import { useAuthStore } from '../features/auth/authStore';
import { env } from '../shared/config/env';

export function LoginPage() {
  const { isAuthenticated, loginAsMock } = useAuth();
  const setSession = useAuthStore((state) => state.setSession);
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/map" replace />;
  }

  const handleLogin = async () => {
    setError(null);

    try {
      const response = await login({ adminId, password });
      setSession(response.user, response.accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '로그인하지 못했습니다.');
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">보안 접속</p>
        <h1>관제 대시보드 로그인</h1>
        <p className="muted">Mock 인증이 꺼져 있으면 발급받은 관리자 계정으로 로그인합니다.</p>
        {env.enableMockAuth ? (
          <button className="primary-button" type="button" onClick={() => loginAsMock('admin')}>
            Mock 관리자로 로그인
          </button>
        ) : (
          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleLogin();
            }}
          >
            <label>
              관리자 ID
              <input value={adminId} onChange={(event) => setAdminId(event.target.value)} />
            </label>
            <label>
              비밀번호
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button className="primary-button" type="submit">
              로그인
            </button>
            {error ? <p className="warning-line">{error}</p> : null}
          </form>
        )}
      </section>
    </main>
  );
}
