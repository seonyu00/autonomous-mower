import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/providers/authContext';

export function LoginPage() {
  const { isAuthenticated, loginAsMock } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/map" replace />;
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">Secure Access</p>
        <h1>관제 대시보드 로그인</h1>
        <p className="muted">Phase 1에서는 실제 백엔드 인증 대신 mock 관리자 세션을 사용합니다.</p>
        <button className="primary-button" type="button" onClick={() => loginAsMock('admin')}>
          Mock Admin Login
        </button>
      </section>
    </main>
  );
}
