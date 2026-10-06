import { PasswordChangeForm } from '../features/accounts/PasswordChangeForm';
import { useAuthStore } from '../features/auth/authStore';

export function ChangePasswordPage() {
  const logout = useAuthStore((state) => state.clearSession);
  return <main className="login-page"><section className="login-panel">
    <h1>비밀번호 변경</h1>
    <p>처음 로그인했거나 비밀번호가 재설정되었습니다. 새 비밀번호를 설정한 뒤 관제를 이용할 수 있습니다.</p>
    <PasswordChangeForm />
    <button className="secondary-button" type="button" onClick={logout}>로그아웃</button>
  </section></main>;
}
