import { useRobotStore } from '../../robots/robotStore';
import { receptionLabels, useTelemetryReception } from '../useTelemetryReception';
import { hasUsableTelemetryPosition } from '../position';
import { useTelemetryStore } from '../telemetryStore';
import type { RobotMode, WorkState } from '../types';

const modeLabels: Record<RobotMode, string> = { manual: '수동 주행', autonomous: '자율 주행', emergency: '긴급 정지', idle: '대기' };
const workLabels: Record<WorkState, string> = { idle: '대기', mowing: '예초 중', paused: '일시 정지', error: '오류' };

type TelemetryPanelProps = {
  compact?: boolean;
};

export function TelemetryPanel({ compact = false }: TelemetryPanelProps) {
  const dataSource = useTelemetryStore((state) => state.dataSource);
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const selectedRobot = useRobotStore((state) =>
    selectedRobotId ? state.robots.find((robot) => robot.id === selectedRobotId) : undefined,
  );
  const telemetry = useTelemetryStore((state) =>
    selectedRobotId ? state.telemetryByRobotId[selectedRobotId] : undefined,
  );

  const reception = useTelemetryReception(selectedRobotId);
  const stale = reception.state === 'delayed';
  const receptionText = receptionLabels[reception.state];

  if (!telemetry) {
    return (
      <section className={`telemetry-panel telemetry-empty${compact ? ' compact-telemetry' : ''}`}>
        <div className="telemetry-empty-copy">
          <h2>{selectedRobotId ? '텔레메트리 수신 대기' : '선택된 로봇 없음'}</h2>
          <p className="muted">{selectedRobotId ? '장비가 연결되면 작업 상태와 배터리가 표시됩니다.' : '로봇을 선택하면 상태를 확인할 수 있습니다.'}</p>
        </div>
        {selectedRobotId ? <span className={stale ? 'status-pill degraded' : 'status-pill'} aria-label="텔레메트리 수신 상태">{receptionText}</span> : null}
      </section>
    );
  }

  const lastReceivedText = reception.elapsedMs === null ? '미수신' : `${Math.floor(reception.elapsedMs / 1000)}초 전`;
  const connectionText =
    selectedRobot?.connectionState === 'online'
      ? '온라인'
      : selectedRobot?.connectionState === 'degraded'
        ? '지연'
        : '오프라인';
  const positionAvailable = hasUsableTelemetryPosition(telemetry);
  const batteryText = telemetry.batteryLevel === null ? '미수신' : `${telemetry.batteryLevel}%`;
  const speedText = telemetry.speedMps === null ? '미수신' : `${telemetry.speedMps.toFixed(1)} m/s`;
  const modeText = telemetry.mode === null ? '모드 미수신' : modeLabels[telemetry.mode];
  const workText = telemetry.workState === null ? '작업 상태 미수신' : workLabels[telemetry.workState];

  if (compact) {
    return (
      <section className="telemetry-panel compact-telemetry" aria-label="선택 로봇 요약 텔레메트리">
        <div className="overview-state">
          <p className="overview-source">{telemetry.robotId}{dataSource === 'mock' ? ' · 샘플 텔레메트리' : ' · 현재 장비'}</p>
          <h2>{workText}</h2>
          <p><span>{modeText}</span> · <span>{connectionText}</span></p>
        </div>
        <div className="overview-metric">
          <Metric label="배터리" value={batteryText} priority />
          <span className="overview-note">장비 전원 상태</span>
        </div>
        <div className="overview-metric">
          <Metric label="속도" value={speedText} priority />
          <span className="overview-note">GPS / RTK · <span>{positionAvailable ? dataSource === 'mock' ? '샘플 위치' : 'GPS 수신' : 'GPS 미수신'}</span></span>
        </div>
        <div className="overview-metric">
          <Metric label="마지막 수신" value={lastReceivedText} priority />
          <span className={stale ? 'status-pill degraded' : 'status-pill connected'} aria-label="텔레메트리 수신 상태">{receptionText}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="telemetry-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">텔레메트리(Telemetry)</p>
          <h2>{telemetry.robotId}{dataSource === 'mock' ? ' · 샘플 텔레메트리' : ''}</h2>
        </div>
        <span className={stale ? 'status-pill degraded' : 'status-pill connected'} aria-label="텔레메트리 수신 상태">
          {receptionText}
        </span>
      </div>

      <div className="metric-grid">
        <Metric label="배터리" value={batteryText} />
        <Metric label="모드" value={modeText} />
        <Metric label="작업" value={workText} />
        <Metric label="속도" value={speedText} />
        <Metric label="신호" value={telemetry.signalStrength === null ? '미수신' : `${telemetry.signalStrength}%`} />
        <Metric label="마지막 수신" value={lastReceivedText} />
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
