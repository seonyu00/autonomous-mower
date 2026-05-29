import { PermissionGate } from '../features/auth/guards';
import { PhasePlaceholder } from '../shared/ui/PhasePlaceholder';

export function SettingsPage() {
  return (
    <section className="workspace-panel full-height">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2>Settings</h2>
        </div>
      </div>
      <PermissionGate
        permission="settings:read"
        fallback={<PhasePlaceholder title="설정 조회 권한이 없습니다. RBAC skeleton이 이 영역을 차단합니다." />}
      >
        <PhasePlaceholder title="설정 화면 placeholder. 사용자/권한/연결 정책 설정은 이후 단계에서 구체화합니다." />
      </PermissionGate>
    </section>
  );
}
