import { PhasePlaceholder } from '../shared/ui/PhasePlaceholder';

export function LogViewerPage() {
  return (
    <section className="workspace-panel full-height">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Phase 2</p>
          <h2>Log Viewer</h2>
        </div>
      </div>
      <PhasePlaceholder title="이벤트 로그와 스냅샷 조회 placeholder. 장애물, 통신 단절, E-Stop 이벤트 조회는 Phase 2에서 구현합니다." />
    </section>
  );
}
