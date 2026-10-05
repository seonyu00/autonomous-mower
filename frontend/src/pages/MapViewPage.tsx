import { MapViewMap } from '../features/map/components/MapViewMap';
import { WorkZoneEditor } from '../features/map/components/WorkZoneEditor';

export function MapViewPage() {
  return (
    <div className="map-console-page">
      <section className="workspace-panel map-console-map" aria-label="실시간 작업 지도">
        <div className="panel-heading">
          <div>
            <h2>작업 지도</h2>
          </div>
          <details className="work-zone-drawer" name="map-tools">
            <summary>
              <span>작업 구역 설정</span>
              <small>열기</small>
            </summary>
            <div className="work-zone-drawer-content">
              <WorkZoneEditor />
            </div>
          </details>
        </div>

        <div className="map-console-stage">
          <MapViewMap />
        </div>
      </section>

    </div>
  );
}
