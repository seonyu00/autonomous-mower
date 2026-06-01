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
        <p className="eyebrow">텔레메트리(Telemetry)</p>
        <h2>선택된 로봇 없음</h2>
      </section>
    );
  }

  const lastReceivedMs = Date.now() - new Date(telemetry.lastReceivedAt).getTime();
  const stale = lastReceivedMs > 3000;

  return (
    <section className="telemetry-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">텔레메트리(Telemetry)</p>
          <h2>{telemetry.robotId}</h2>
        </div>
        <span className={stale ? 'status-pill degraded' : 'status-pill connected'}>
          {stale ? '지연' : '실시간'}
        </span>
      </div>

      <div className="metric-grid">
        <Metric label="배터리" value={`${telemetry.batteryLevel}%`} />
        <Metric label="모드" value={telemetry.mode.toUpperCase()} />
        <Metric label="작업" value={telemetry.workState.toUpperCase()} />
        <Metric label="속도" value={`${telemetry.speedMps.toFixed(1)} m/s`} />
        <Metric label="신호" value={`${telemetry.signalStrength}%`} />
        <Metric label="마지막 수신" value={stale ? '> 3s' : '< 3s'} />
      </div>

      <div className="coordinate-box">
        <span>위도</span>
        <strong>{telemetry.latitude.toFixed(6)}</strong>
        <span>경도</span>
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
