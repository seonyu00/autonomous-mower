import { ControlPanel } from '../features/control/ControlPanel';
import { MapViewMap } from '../features/map/components/MapViewMap';
import { WorkZoneEditor } from '../features/map/components/WorkZoneEditor';
import { PhasePlaceholder } from '../shared/ui/PhasePlaceholder';

export function MapViewPage() {
  return (
    <div className="page-grid">
      <section className="workspace-panel map-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">실시간 운용</p>
            <h2>지도 보기</h2>
          </div>
          <span className="status-pill connected">1Hz 샘플 텔레메트리(Telemetry)</span>
        </div>
        <MapViewMap />
      </section>

      <section className="workspace-panel">
        <WorkZoneEditor />
      </section>

      <section className="workspace-panel">
        <ControlPanel />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">4단계 예정 기능</p>
            <h2>실시간 카메라</h2>
          </div>
        </div>
        <PhasePlaceholder title="WebRTC 온디맨드 영상 모듈은 이후 단계에서 연결합니다." />
      </section>
    </div>
  );
}
