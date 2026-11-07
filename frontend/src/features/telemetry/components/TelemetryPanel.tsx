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
  const recording = useTelemetryStore((state) => selectedRobotId ? state.receptionByRobotId[selectedRobotId]?.recording : undefined);
  const connected = useTelemetryStore((state) => state.connectionState === 'connected');
  const recordingLabel = !connected ? '연결 대기 · 현재 DB 기록 상태 확인 불가' : recording?.state === 'available' ? 'DB 기록 가능'
    : recording?.state === 'buffered' ? 'DB 저장 대기 · 로컬 보관분 재저장 대기' : 'DB 기록 확인 전';
  const recordingNotice = dataSource === 'real' && (
    <p aria-label="서버 기록 상태" className={recording?.possibleGap || recording?.state === 'buffered' ? 'warning-line' : 'muted'}>
      {recordingLabel}{recording?.possibleGap && ' · 일부 기록 누락 가능'}
    </p>
  );
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
        {selectedRobotId && recordingNotice}
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
  const code = telemetry.errorState;
  let errorLabel = '알 수 없는 오류';
  if (code === 'emergency-stop-active') errorLabel = '비상 정지 활성화';
  if (dataSource === 'mock' && (code === '통신 끊김' || code === '텔레메트리(Telemetry) 지연')) errorLabel = code;
  const errorNotice = code ? (
    <div className="warning-line">
      <p role="status">{errorLabel}</p>
      {errorLabel === '알 수 없는 오류' && <details><summary>원본 오류 코드</summary><code>{code}</code></details>}
    </div>
  ) : dataSource === 'real' && <p className="muted">{telemetry.errorObserved
    ? '이번 장비 메시지에 오류 코드 없음' : '장비 오류 해제 여부 확인 불가'}</p>;

  if (compact) {
    return (
      <section className="telemetry-panel compact-telemetry" aria-label="선택 로봇 요약 텔레메트리">
        <div className="overview-state">
          <p className="overview-source">{telemetry.robotId}{dataSource === 'mock' ? ' · 샘플 텔레메트리' : ' · 현재 장비'}</p>
          <h2>{workText}</h2>
          <p><span>{modeText}</span> · <span>{connectionText}</span></p>
          {errorNotice}
          {recordingNotice}
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

      {errorNotice}
      {recordingNotice}
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
