import { PhasePlaceholder } from '../shared/ui/PhasePlaceholder';

export function HistoryPage() {
  return (
    <section className="workspace-panel full-height">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Phase 2</p>
          <h2>History</h2>
        </div>
      </div>
      <PhasePlaceholder title="이력 조회 화면 placeholder. 날짜와 로봇 기준 검색은 Phase 2에서 구현합니다." />
    </section>
  );
}
