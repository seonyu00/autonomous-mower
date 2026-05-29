import { MapViewMap } from '../features/map/components/MapViewMap';
import { WorkZoneEditor } from '../features/map/components/WorkZoneEditor';
import { PhasePlaceholder } from '../shared/ui/PhasePlaceholder';

export function MapViewPage() {
  return (
    <div className="page-grid">
      <section className="workspace-panel map-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Live Operations</p>
            <h2>Map View</h2>
          </div>
          <span className="status-pill connected">1Hz mock telemetry</span>
        </div>
        <MapViewMap />
      </section>

      <section className="workspace-panel">
        <WorkZoneEditor />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Phase 3 Placeholder</p>
            <h2>Manual Control</h2>
          </div>
        </div>
        <PhasePlaceholder title="E-Stop and joystick are intentionally not implemented in Phase 1." />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Phase 4 Placeholder</p>
            <h2>Live Camera</h2>
          </div>
        </div>
        <PhasePlaceholder title="WebRTC on-demand video module placeholder." />
      </section>
    </div>
  );
}
