import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../auth/api';
import { useAuthStore } from '../auth/authStore';
import { env } from '../../shared/config/env';
import { validateNewPassword } from './passwordPolicy';

export function PasswordChangeForm() {
  const navigate = useNavigate();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!validateNewPassword(newPassword)) { setError('새 비밀번호는 최소 10자, UTF-8 최대 72바이트로 입력하세요.'); return; }
    if (newPassword !== confirmation) { setError('새 비밀번호 확인이 일치하지 않습니다.'); return; }
    const version = useAuthStore.getState().sessionVersion;
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      if (useAuthStore.getState().sessionVersion !== version) return;
      useAuthStore.getState().clearSession();
      navigate('/login', { replace: true, state: { message: '비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요.' } });
    } catch (cause) {
      if (useAuthStore.getState().sessionVersion === version) setError(cause instanceof Error ? cause.message : '비밀번호를 변경하지 못했습니다.');
    } finally { setBusy(false); }
  };

  return <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <label>현재 비밀번호<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} required disabled={busy || env.enableMockAuth} /></label>
    <label>새 비밀번호<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNew(event.target.value)} required disabled={busy || env.enableMockAuth} aria-describedby="password-policy" /></label>
    <label>새 비밀번호 확인<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={busy || env.enableMockAuth} /></label>
    <p className="muted" id="password-policy">10자 이상 입력하세요. 영문 기준 최대 72자이며, 변경하면 모든 로그인 세션이 종료됩니다.</p>
    {error ? <p role="alert">{error}</p> : null}
    <button className="primary-button" type="submit" disabled={busy || env.enableMockAuth}>{busy ? '변경 중…' : '비밀번호 변경'}</button>
  </form>;
}
