import { ControlPanel } from '../features/control/ControlPanel';
import { EmergencyStopButton } from '../features/control/EmergencyStopButton';
import { MapViewMap } from '../features/map/components/MapViewMap';
import { WorkZoneEditor } from '../features/map/components/WorkZoneEditor';

export function MapViewPage() {
  return (
    <div className="map-console-page">
      <section className="workspace-panel map-console-map" aria-label="실시간 작업 지도">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">실시간 운용</p>
            <h2>작업 지도</h2>
          </div>
          <span className="status-pill connected">1Hz 샘플 텔레메트리(Telemetry)</span>
        </div>

        <div className="map-console-stage">
          <MapViewMap />
          <details className="work-zone-drawer">
            <summary>
              <span>작업 구역 설정</span>
              <small>열기</small>
            </summary>
            <div className="work-zone-drawer-content">
              <WorkZoneEditor />
            </div>
          </details>
        </div>
      </section>

      <section className="workspace-panel map-console-controls" aria-label="하단 운용 제어">
        <div className="map-control-content">
          <ControlPanel compact />
        </div>
        <aside className="safety-control-zone" aria-label="비상 정지 안전 영역">
          <div>
            <p className="eyebrow">안전 제어</p>
            <h2>비상 정지</h2>
          </div>
          <p>모든 주행 및 예초 출력을 최우선으로 중단합니다.</p>
          <EmergencyStopButton />
        </aside>
      </section>
    </div>
  );
}
