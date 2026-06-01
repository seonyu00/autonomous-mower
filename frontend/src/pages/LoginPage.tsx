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
      setError(caught instanceof Error ? caught.message : 'Login failed.');
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">Secure Access</p>
        <h1>Control Dashboard Login</h1>
        <p className="muted">Use your provisioned admin credentials when mock auth is disabled.</p>
        {env.enableMockAuth ? (
          <button className="primary-button" type="button" onClick={() => loginAsMock('admin')}>
            Mock Admin Login
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
              Admin ID
              <input value={adminId} onChange={(event) => setAdminId(event.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button className="primary-button" type="submit">
              Login
            </button>
            {error ? <p className="warning-line">{error}</p> : null}
          </form>
        )}
      </section>
    </main>
  );
}
