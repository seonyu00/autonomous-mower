import { useEffect, useState } from 'react';
import { accountApi, roleLabels } from './api';
import type { Account, AccountAudit, Page } from './api';
import type { Role } from '../auth/types';
import { useAuthStore } from '../auth/authStore';
import { ApiError } from '../../shared/api/errors';
import { validateNewPassword } from './passwordPolicy';

const roles = Object.keys(roleLabels) as Role[];
const auditLabels: Record<string, string> = { created: '계정 생성', 'access-changed': '권한·상태 변경', 'password-reset': '비밀번호 재설정', 'password-changed': '비밀번호 변경' };
function utc(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)); }

export function AccountManagement() {
  const userId = useAuthStore((state) => state.user?.id);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [accounts, setAccounts] = useState<Page<Account> | null>(null);
  const [audit, setAudit] = useState<Page<AccountAudit> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [role, setRole] = useState<Role>('read-only');
  const [enabled, setEnabled] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState('');
  const [newRole, setNewRole] = useState<Role>('read-only');
  const [temporaryPassword, setTemporary] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isCurrent = () => useAuthStore.getState().sessionVersion === sessionVersion;

  useEffect(() => {
    let active = true;
    setAccounts(null); setLoadError(null);
    void accountApi.list(query, page).then((result) => {
      if (active && useAuthStore.getState().sessionVersion === sessionVersion) setAccounts(result);
    }).catch((cause: unknown) => {
      if (active && useAuthStore.getState().sessionVersion === sessionVersion) setLoadError(cause instanceof Error ? cause.message : '계정 목록을 조회하지 못했습니다.');
    });
    return () => { active = false; };
  }, [query, page, revision, sessionVersion]);

  useEffect(() => {
    let active = true;
    setAudit(null); setAuditError(null);
    void accountApi.audit(auditPage).then((result) => {
      if (active && useAuthStore.getState().sessionVersion === sessionVersion) setAudit(result);
    }).catch((cause: unknown) => {
      if (active && useAuthStore.getState().sessionVersion === sessionVersion) setAuditError(cause instanceof Error ? cause.message : '감사 기록을 조회하지 못했습니다.');
    });
    return () => { active = false; };
  }, [auditPage, revision, sessionVersion]);

  const select = (account: Account) => {
    setSelected(account); setRole(account.role); setEnabled(account.enabled); setConfirmed(false);
    setResetPassword(''); setCurrentPassword(''); setError(null); setConflict(false); setMessage(null);
  };

  const perform = async (action: () => Promise<Account>, success: string) => {
    setBusy(true); setError(null); setConflict(false); setMessage(null);
    try {
      const result = await action();
      if (!isCurrent()) return;
      select(result); setMessage(success); setRevision((value) => value + 1);
      setTemporary(''); setCreating(false);
    } catch (cause) {
      if (!isCurrent()) return;
      setConflict(cause instanceof ApiError && cause.code === 'ACCOUNT_VERSION_CONFLICT');
      setError(cause instanceof Error ? cause.message : '계정 변경에 실패했습니다. 입력을 확인한 뒤 다시 시도하세요.');
    } finally { if (isCurrent()) setBusy(false); }
  };

  const reloadSelected = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await accountApi.get(selected.adminId);
      if (!isCurrent()) return;
      setSelected(result); setConfirmed(false); setConflict(false); setError(null);
      setMessage('최신 정보를 조회했습니다. 입력한 변경 내용은 유지됐습니다. 변경 전후를 다시 확인하세요.');
      setRevision((value) => value + 1);
    } catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : '최신 정보를 조회하지 못했습니다.'); }
    finally { if (isCurrent()) setBusy(false); }
  };

  return <>
    <section className="workspace-panel settings-section" aria-labelledby="account-management-heading">
      <div className="panel-heading"><div><h2 id="account-management-heading">계정 관리</h2><p className="muted">관리자만 계정을 생성하거나 권한을 변경할 수 있습니다.</p></div>
        <button className="primary-button" disabled={busy} onClick={() => { setCreating(!creating); setTemporary(''); setMessage(null); setError(null); }}>{creating ? '생성 취소' : '새 계정'}</button>
      </div>
      {creating ? <form className="settings-form settings-create" onSubmit={(event) => {
        event.preventDefault();
        if (!validateNewPassword(temporaryPassword)) { setError('임시 비밀번호는 최소 10자, UTF-8 최대 72바이트로 입력하세요.'); return; }
        void perform(() => accountApi.create({ adminId: newId, role: newRole, temporaryPassword }), '계정을 생성했습니다. 임시 비밀번호는 대상 사용자에게 별도로 전달하세요.');
      }}>
        <h3>새 계정 생성</h3>
        <label>새 계정 ID<input value={newId} maxLength={20} pattern={'[A-Za-z0-9._\\-]{1,20}'} autoComplete="off" required disabled={busy} onChange={(event) => setNewId(event.target.value)} /></label>
        <p className="muted">영문·숫자·점·밑줄·하이픈, 최대 20자. 생성 후 ID는 바꿀 수 없습니다.</p>
        <label>새 계정 역할<select value={newRole} disabled={busy} onChange={(event) => setNewRole(event.target.value as Role)}>{roles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label>
        <label>임시 비밀번호<input type="password" autoComplete="new-password" value={temporaryPassword} required disabled={busy} onChange={(event) => setTemporary(event.target.value)} /></label>
        <p className="muted">10자 이상. 처음 로그인하면 비밀번호를 변경해야 관제를 이용할 수 있습니다.</p>
        <button className="primary-button" disabled={busy} type="submit">{busy ? '생성 중…' : '계정 생성'}</button>
      </form> : null}
      <form className="settings-search" onSubmit={(event) => { event.preventDefault(); setPage(0); setQuery(search); setRevision((value) => value + 1); }}>
        <label>계정 ID 검색<input value={search} maxLength={50} onChange={(event) => setSearch(event.target.value)} /></label>
        <button className="secondary-button" disabled={busy} type="submit">조회</button>
      </form>
      {loadError ? <p role="alert">{loadError}</p> : !accounts ? <p role="status">계정 목록을 불러오는 중입니다.</p> : <>
        <p className="muted">총 {accounts.totalElements}개 계정</p>
        {accounts.items.length === 0 ? <p>검색한 ID에 해당하는 계정이 없습니다.</p> : <div className="settings-table-wrap"><table className="settings-table"><thead><tr><th scope="col">계정 ID</th><th scope="col">역할</th><th scope="col">상태</th><th scope="col">관리</th></tr></thead>
          <tbody>{accounts.items.map((account) => <tr key={account.adminId} className={selected?.adminId === account.adminId ? 'selected' : ''}>
            <th scope="row">{account.adminId}{account.adminId === userId ? <small>내 계정</small> : null}</th>
            <td>{roleLabels[account.role]}</td><td>{account.enabled ? '활성' : '비활성'}{account.mustChangePassword ? <small>비밀번호 변경 필요</small> : null}</td>
            <td><button className="secondary-button" disabled={busy} aria-label={`${account.adminId} 관리`} onClick={() => select(account)}>관리</button></td>
          </tr>)}</tbody></table></div>}
        <div className="settings-pagination"><button className="secondary-button" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>이전 계정</button><span>{page + 1} / {Math.max(accounts.totalPages, 1)}</span><button className="secondary-button" disabled={busy || page + 1 >= accounts.totalPages} onClick={() => setPage(page + 1)}>다음 계정</button></div>
      </>}
      {selected ? <div className="settings-editor" aria-label={`${selected.adminId} 계정 편집`}>
        <h3>{selected.adminId} 관리</h3>
        <p className="muted">마지막 수정: {utc(selected.updatedAt)} UTC</p>
        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void perform(() => accountApi.update(selected, { role, enabled }), '계정 권한과 상태를 저장했습니다. 대상의 기존 로그인은 종료됐습니다.'); }}>
          <label>변경할 역할<select value={role} disabled={busy || selected.adminId === userId} onChange={(event) => { setRole(event.target.value as Role); setConfirmed(false); }}>{roles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label>
          <label className="settings-check"><input type="checkbox" checked={enabled} disabled={busy || selected.adminId === userId} onChange={(event) => { setEnabled(event.target.checked); setConfirmed(false); }} />계정 활성</label>
          <p>{roleLabels[selected.role]} · {selected.enabled ? '활성' : '비활성'} → {roleLabels[role]} · {enabled ? '활성' : '비활성'}</p>
          {selected.adminId === userId ? <p className="muted">내 관리자 권한과 활성 상태는 이 화면에서 낮출 수 없습니다.</p> : <>
            <label className="settings-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />대상 계정의 모든 로그인 세션이 종료됨을 확인했습니다.</label>
            <button className="primary-button" type="submit" disabled={busy || !confirmed || (role === selected.role && enabled === selected.enabled)}>권한·상태 저장</button>
          </>}
        </form>
        {selected.adminId !== userId ? <form className="settings-form settings-reset" onSubmit={(event) => {
          event.preventDefault();
          if (!validateNewPassword(resetPassword)) { setError('재설정 비밀번호는 최소 10자, UTF-8 최대 72바이트로 입력하세요.'); return; }
          void perform(() => accountApi.resetPassword(selected, { currentPassword, temporaryPassword: resetPassword }), '비밀번호를 재설정했습니다. 대상 사용자는 다시 로그인해 비밀번호를 변경해야 합니다.');
        }}>
          <h3>비밀번호 재설정</h3>
          <p className="muted">대상의 기존 로그인은 종료됩니다. 관리자 본인의 비밀번호로 재확인합니다.</p>
          <label>관리자 현재 비밀번호<input type="password" autoComplete="current-password" value={currentPassword} required disabled={busy} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>재설정 임시 비밀번호<input type="password" autoComplete="new-password" value={resetPassword} required disabled={busy} onChange={(event) => setResetPassword(event.target.value)} /></label>
          <button className="secondary-button" type="submit" disabled={busy}>비밀번호 재설정</button>
        </form> : null}
      </div> : null}
      {error ? <p role="alert">{error}</p> : null}
      {conflict ? <button className="secondary-button" disabled={busy} onClick={() => { void reloadSelected(); }}>최신 정보 다시 조회</button> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
    <section className="workspace-panel settings-section" aria-labelledby="account-audit-heading"><h2 id="account-audit-heading">계정 변경 기록</h2>
      <p className="muted">누가 어떤 계정을 변경했는지 확인합니다. 시간은 UTC 기준입니다.</p>
      {auditError ? <p role="alert">{auditError}</p> : !audit ? <p role="status">변경 기록을 불러오는 중입니다.</p> : <>
        {audit.items.length === 0 ? <p>아직 계정 변경 기록이 없습니다.</p> : <div className="settings-table-wrap"><table className="settings-table"><thead><tr><th scope="col">시간 · UTC</th><th scope="col">작업</th><th scope="col">대상</th><th scope="col">수행자</th><th scope="col">변경 내용</th></tr></thead><tbody>{audit.items.map((entry) => <tr key={entry.id}>
          <td>{utc(entry.occurredAt)}</td><td>{auditLabels[entry.action] ?? entry.action}</td><th scope="row">{entry.targetId}</th><td>{entry.actorId}</td><td>{entry.action === 'access-changed' ? `${roleLabels[entry.previousRole!]} · ${entry.previousEnabled ? '활성' : '비활성'} → ${roleLabels[entry.newRole!]} · ${entry.newEnabled ? '활성' : '비활성'}` : entry.action === 'created' ? roleLabels[entry.newRole!] : '비밀번호 변경'}</td>
        </tr>)}</tbody></table></div>}
        <div className="settings-pagination"><button className="secondary-button" disabled={auditPage === 0} onClick={() => setAuditPage(auditPage - 1)}>이전 기록</button><span>{auditPage + 1} / {Math.max(audit.totalPages, 1)}</span><button className="secondary-button" disabled={auditPage + 1 >= audit.totalPages} onClick={() => setAuditPage(auditPage + 1)}>다음 기록</button></div>
      </>}
    </section>
  </>;
}
