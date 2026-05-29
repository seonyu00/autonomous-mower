import { useRobotStore } from '../../robots/robotStore';
import { useTelemetryStore } from '../telemetryStore';

export function TelemetryPanel() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const telemetry = useTelemetryStore((state) =>
    selectedRobotId ? state.telemetryByRobotId[selectedRobotId] : undefined,
  );

  if (!telemetry) {
    return (
      <section className="telemetry-panel">
        <p className="eyebrow">Telemetry</p>
        <h2>No Robot Selected</h2>
      </section>
    );
  }

  const lastReceivedMs = Date.now() - new Date(telemetry.lastReceivedAt).getTime();
  const stale = lastReceivedMs > 3000;

  return (
    <section className="telemetry-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Telemetry</p>
          <h2>{telemetry.robotId}</h2>
        </div>
        <span className={stale ? 'status-pill degraded' : 'status-pill connected'}>
          {stale ? 'stale' : 'live'}
        </span>
      </div>

      <div className="metric-grid">
        <Metric label="Battery" value={`${telemetry.batteryLevel}%`} />
        <Metric label="Mode" value={telemetry.mode.toUpperCase()} />
        <Metric label="Work" value={telemetry.workState.toUpperCase()} />
        <Metric label="Speed" value={`${telemetry.speedMps.toFixed(1)} m/s`} />
        <Metric label="Signal" value={`${telemetry.signalStrength}%`} />
        <Metric label="Last RX" value={stale ? '> 3s' : '< 3s'} />
      </div>

      <div className="coordinate-box">
        <span>Latitude</span>
        <strong>{telemetry.latitude.toFixed(6)}</strong>
        <span>Longitude</span>
        <strong>{telemetry.longitude.toFixed(6)}</strong>
      </div>

      {telemetry.errorState ? <p className="warning-line">{telemetry.errorState}</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
