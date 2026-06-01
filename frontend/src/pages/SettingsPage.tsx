import { PermissionGate } from '../features/auth/guards';
import { PhasePlaceholder } from '../shared/ui/PhasePlaceholder';

export function SettingsPage() {
  return (
    <section className="workspace-panel full-height">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">구성</p>
          <h2>설정</h2>
        </div>
      </div>
      <PermissionGate
        permission="settings:read"
        fallback={<PhasePlaceholder title="설정 조회 권한이 없습니다. RBAC 기본 구조에서 이 영역을 차단합니다." />}
      >
        <PhasePlaceholder title="설정 화면 자리표시자입니다. 사용자 권한과 연결 정책 설정은 이후 단계에서 구체화합니다." />
      </PermissionGate>
    </section>
  );
}
