import { useRobotStore } from '../../robots/robotStore';
import { useTelemetryStore } from '../../telemetry/telemetryStore';

export function MapPlaceholder() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const telemetry = useTelemetryStore((state) =>
    selectedRobotId ? state.telemetryByRobotId[selectedRobotId] : undefined,
  );

  return (
    <div className="map-placeholder" role="img" aria-label="Map placeholder">
      <div className="map-grid-lines" />
      <div className="mock-zone" />
      <div className="mock-path" />
      <div className="mock-robot-marker" />
      <div className="map-readout">
        <strong>{selectedRobotId ?? 'No robot'}</strong>
        <span>
          {telemetry ? `${telemetry.latitude.toFixed(5)}, ${telemetry.longitude.toFixed(5)}` : 'No telemetry'}
        </span>
        <small>Map library and Polygon editing are reserved for Phase 2.</small>
      </div>
    </div>
  );
}
