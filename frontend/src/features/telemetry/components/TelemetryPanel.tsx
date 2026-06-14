import { useRobotStore } from '../../robots/robotStore';
import { hasUsablePosition } from '../position';
import { useTelemetryStore } from '../telemetryStore';

type TelemetryPanelProps = {
  compact?: boolean;
};

export function TelemetryPanel({ compact = false }: TelemetryPanelProps) {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const selectedRobot = useRobotStore((state) =>
    selectedRobotId ? state.robots.find((robot) => robot.id === selectedRobotId) : undefined,
  );
  const telemetry = useTelemetryStore((state) =>
    selectedRobotId ? state.telemetryByRobotId[selectedRobotId] : undefined,
  );

  if (!telemetry) {
    return (
      <section className={compact ? 'telemetry-panel compact-telemetry' : 'telemetry-panel'}>
        <p className="eyebrow">텔레메트리(Telemetry)</p>
        <h2>선택된 로봇 없음</h2>
      </section>
    );
  }

  const lastReceivedMs = Date.now() - new Date(telemetry.lastReceivedAt).getTime();
  const stale = lastReceivedMs > 3000;
  const lastReceivedText = `${Math.max(0, Math.floor(lastReceivedMs / 1000))}초 전`;
  const connectionText =
    selectedRobot?.connectionState === 'online'
      ? '온라인'
      : selectedRobot?.connectionState === 'degraded'
        ? '지연'
        : '오프라인';
  const positionAvailable = hasUsablePosition(telemetry.latitude, telemetry.longitude);

  if (compact) {
    return (
      <section className="telemetry-panel compact-telemetry" aria-label="선택 로봇 요약 텔레메트리">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">{telemetry.robotId}</p>
            <h2>선택 로봇 요약</h2>
          </div>
          <span className={stale ? 'status-pill degraded' : 'status-pill connected'}>
            {connectionText}
          </span>
        </div>

        <div className="compact-telemetry-primary" aria-label="핵심 장비 상태">
          <Metric label="배터리" value={`${telemetry.batteryLevel}%`} priority />
          <Metric label="모드" value={telemetry.mode.toUpperCase()} priority />
          <Metric label="작업 상태" value={telemetry.workState.toUpperCase()} priority />
          <Metric label="통신 상태" value={connectionText} priority />
        </div>
        <div className="compact-telemetry-secondary" aria-label="보조 텔레메트리">
          <Metric label="속도" value={`${telemetry.speedMps.toFixed(1)} m/s`} />
          <Metric label="GPS / RTK" value={positionAvailable ? 'GPS 수신' : 'GPS 미수신'} />
          <Metric label="마지막 수신" value={lastReceivedText} wide />
        </div>
      </section>
    );
  }

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
        {positionAvailable ? (
          <>
            <span>위도</span>
            <strong>{telemetry.latitude.toFixed(6)}</strong>
            <span>경도</span>
            <strong>{telemetry.longitude.toFixed(6)}</strong>
          </>
        ) : (
          <>
            <span>현재 좌표</span>
            <strong>위치 수신 대기</strong>
          </>
        )}
      </div>

      {telemetry.errorState ? <p className="warning-line">{telemetry.errorState}</p> : null}
    </section>
  );
}

function Metric({
  label,
  value,
  wide = false,
  priority = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  priority?: boolean;
}) {
  return (
    <div className={`metric${wide ? ' wide' : ''}${priority ? ' priority' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
