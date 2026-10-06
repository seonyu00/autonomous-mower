import { useEffect, useState } from 'react';
import { useAuthStore } from '../features/auth/authStore';
import { getProfile } from '../features/auth/api';
import type { AuthUser, Permission } from '../features/auth/types';
import { AccountManagement } from '../features/accounts/AccountManagement';
import { PasswordChangeForm } from '../features/accounts/PasswordChangeForm';
import { roleLabels } from '../features/accounts/api';
import { env } from '../shared/config/env';
import { useTelemetryStore } from '../features/telemetry/telemetryStore';

const permissionLabels: Record<Permission, string> = {
  'robots:read': '장비 조회', 'telemetry:read': '상태 조회', 'history:read': '이력 조회', 'logs:read': '로그 조회',
  'settings:read': '내 설정 조회', 'control:write': '장비 조작', 'control:takeover': '제어권 강제 회수',
  'accounts:read': '계정·감사 조회', 'accounts:write': '계정 관리',
};

export function SettingsPage() {
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const logout = useAuthStore((state) => state.clearSession);
  const connection = useTelemetryStore((state) => state.connectionState);
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setProfile(null); setError(null);
    if (!useAuthStore.getState().isAuthenticated) return;
    void getProfile().then((result) => {
      if (active && useAuthStore.getState().sessionVersion === sessionVersion) setProfile(result);
    }).catch((cause: unknown) => {
      if (active && useAuthStore.getState().sessionVersion === sessionVersion) setError(cause instanceof Error ? cause.message : '계정 정보를 조회하지 못했습니다.');
    });
    return () => { active = false; };
  }, [revision, sessionVersion]);

  return (
    <div className="settings-page">
      <section className="workspace-panel settings-section">
        <div className="panel-heading"><div><h2>내 계정</h2><p className="muted">로그인 정보와 이 계정이 사용할 수 있는 기능입니다.</p></div><button className="secondary-button" onClick={logout}>로그아웃</button></div>
        {env.enableMockAuth ? <p className="settings-notice">샘플 계정입니다. 계정 관리와 비밀번호 변경은 실제 서버에 로그인한 뒤 사용할 수 있습니다.</p> : null}
        {error ? <><p role="alert">{error}</p><button className="secondary-button" onClick={() => setRevision(revision + 1)}>계정 정보 다시 조회</button></> : !profile ? <p role="status">계정 정보를 불러오는 중입니다.</p> : <>
          <dl className="settings-details"><div><dt>계정 ID</dt><dd>{profile.id}</dd></div><div><dt>역할</dt><dd>{roleLabels[profile.role]}</dd></div><div><dt>사용 가능한 기능</dt><dd>{profile.permissions?.map((permission) => permissionLabels[permission] ?? permission).join(' · ')}</dd></div></dl>
          <details className="settings-password"><summary>내 비밀번호 변경</summary><PasswordChangeForm /></details>
        </>}
      </section>
      {profile?.permissions?.includes('accounts:read') && !env.enableMockAuth ? <AccountManagement /> : null}
      <section className="workspace-panel settings-section"><h2>연결 상태</h2>
        <dl className="settings-details"><div><dt>계정 정보 API</dt><dd>{env.enableMockAuth ? '샘플 모드' : error ? '조회 실패' : profile ? '조회 성공' : '조회 중'}</dd></div><div><dt>실시간 상태</dt><dd>{connection === 'connected' ? '연결됨' : connection === 'mock' ? '샘플 모드' : '연결 대기 또는 재연결 중'}</dd></div><div><dt>네이버 지도</dt><dd>{env.naverMapClientId ? '사용 설정됨' : '미설정'}</dd></div></dl>
        <p className="muted">서버 연결 주소와 제어·안전 정책은 배포 설정에서 관리합니다.</p>
      </section>
    </div>
  );
}
