import { useState } from 'react';
import { PermissionGate } from '../auth/guards';
import { useAuthStore } from '../auth/authStore';
import { useRobotStore } from '../robots/robotStore';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { Button } from '../../shared/ui/Button';
import { claimControl, ControlPrecheckError, releaseControl, resetAfterEmergency, takeoverControl } from './controlApi';
import { canControlRobot, canResetAfterEmergency } from './controlSelectors';
import { createDefaultControlState, useControlStore } from './controlStore';
import { GeneralControlCommands } from './GeneralControlCommands';
import { ManualJoystick } from './ManualJoystick';
import type { ControlLockState } from './types';

const lockStates: ControlLockState[] = ['none', 'requesting', 'held', 'held-by-other', 'expired', 'revoked'];

const reasonLabels: Record<string, string> = {
  'not-authenticated': '작업자 세션이 없습니다.',
  'missing-control-permission': '현재 역할로는 제어할 수 없습니다.',
  'robot-not-selected': '제어할 로봇을 먼저 선택합니다.',
  'control-lock-not-held': '수동 제어권(Control Lock)이 없습니다.',
  'control-owned-by-other-user': '다른 사용자가 제어권(Control Lock)을 잡고 있습니다.',
  'realtime-connecting': '실시간 연결을 설정하는 중입니다.',
  'realtime-reconnecting': '실시간 연결을 다시 연결하는 중입니다.',
  'realtime-degraded': '실시간 연결 상태가 저하되었습니다.',
  'realtime-disconnected': '실시간 연결이 끊겼습니다.',
  'robot-in-emergency': '로봇이 긴급 정지(E-Stop) 상태입니다.',
  'robot-not-in-emergency': '로봇이 긴급 정지(E-Stop) 상태가 아닙니다.',
  'transport-not-ready': '보안 연결이 아직 준비되지 않았습니다.',
};

export function ControlPanel() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const user = useAuthStore((state) => state.user);
  const connectionState = useTelemetryStore((state) => state.connectionState);
  const protocolState = useTelemetryStore((state) => state.protocolState);
  const controlByRobotId = useControlStore((state) => state.controlByRobotId);
  const [actionError, setActionError] = useState<string | null>(null);

  const controlState = selectedRobotId
    ? controlByRobotId[selectedRobotId] ?? createDefaultControlState(selectedRobotId)
    : null;

  const eligibility = selectedRobotId ? canControlRobot(selectedRobotId) : { allowed: false, reasons: ['robot-not-selected'] };
  const resetEligibility = selectedRobotId
    ? canResetAfterEmergency(selectedRobotId)
    : { allowed: false, reasons: ['robot-not-selected'] };

  const handleAction = async (action: 'claim' | 'release' | 'takeover' | 'reset-after-emergency') => {
    if (!selectedRobotId) {
      setActionError('먼저 로봇을 선택합니다.');
      return;
    }

    setActionError(null);

    try {
      if (action === 'claim') {
        await claimControl(selectedRobotId);
      }

      if (action === 'release') {
        await releaseControl(selectedRobotId);
      }

      if (action === 'takeover') {
        await takeoverControl(selectedRobotId);
      }

      if (action === 'reset-after-emergency') {
        await resetAfterEmergency(selectedRobotId);
      }
    } catch (error) {
      if (error instanceof ControlPrecheckError) {
        setActionError(error.reasons.map(formatReason).join(' '));
        return;
      }

      setActionError(error instanceof Error ? error.message : '제어 요청을 처리하지 못했습니다.');
    }
  };

  const ownedByCurrentUser = Boolean(controlState?.controlOwner && user?.id === controlState.controlOwner);
  const heldByOther =
    controlState?.lockState === 'held-by-other' ||
    (controlState?.lockState === 'held' && Boolean(controlState.controlOwner) && !ownedByCurrentUser);
  const emergencyActive = Boolean(controlState?.emergency || controlState?.mode === 'emergency');

  return (
    <div className="control-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">3단계</p>
          <h2>제어권(Control Lock)</h2>
        </div>
        <span className={eligibility.allowed ? 'status-pill connected' : 'status-pill degraded'}>
          {eligibility.allowed ? '제어 가능' : '잠김'}
        </span>
      </div>

      <div className="control-summary">
        <Metric label="로봇" value={selectedRobotId ?? '없음'} />
        <Metric label="제어권" value={controlState?.lockState ?? 'none'} />
        <Metric label="소유자" value={controlState?.controlOwner ?? '미할당'} />
        <Metric label="모드" value={controlState?.mode ?? 'idle'} />
        <Metric label="긴급 정지" value={emergencyActive ? '활성' : '정상'} />
        <Metric label="실시간" value={connectionState} />
        <Metric label="WSS" value={protocolState.wss} />
      </div>

      {emergencyActive ? (
        <section className="estop-recovery-panel" aria-label="긴급 정지 복구 상태">
          <strong>긴급 정지(E-Stop)가 활성화되었습니다.</strong>
          <p>이전 명령은 자동으로 재개되지 않습니다. 초기화하면 로봇은 대기 상태로 돌아갑니다.</p>
          <Button type="button" disabled={!resetEligibility.allowed} onClick={() => void handleAction('reset-after-emergency')}>
            긴급 정지 후 초기화
          </Button>
          {resetEligibility.reasons.length > 0 ? (
            <ul>
              {resetEligibility.reasons.map((reason) => (
                <li key={reason}>{formatReason(reason)}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="lock-state-list" aria-label="제어권 상태 목록">
        {lockStates.map((lockState) => (
          <span key={lockState} className={controlState?.lockState === lockState ? 'lock-state active' : 'lock-state'}>
            {lockState}
          </span>
        ))}
      </div>

      <div className="control-actions">
        <Button
          type="button"
          variant="primary"
          disabled={
            emergencyActive || !selectedRobotId || controlState?.lockState === 'requesting' || controlState?.lockState === 'held'
          }
          onClick={() => void handleAction('claim')}
        >
          제어권 요청
        </Button>
        <Button
          type="button"
          disabled={emergencyActive || !selectedRobotId || !ownedByCurrentUser}
          onClick={() => void handleAction('release')}
        >
          제어권 반납
        </Button>
        <PermissionGate permission="control:takeover">
          <Button
            type="button"
            disabled={emergencyActive || !selectedRobotId || !heldByOther}
            onClick={() => void handleAction('takeover')}
          >
            강제 회수
          </Button>
        </PermissionGate>
      </div>

      <section className="control-reasons" aria-label="제어 가능 여부">
        <strong>{eligibility.allowed ? '제어 가능 상태입니다.' : '현재 제어할 수 없습니다.'}</strong>
        {eligibility.reasons.length > 0 ? (
          <ul>
            {eligibility.reasons.map((reason) => (
              <li key={reason}>{formatReason(reason)}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {controlState?.pendingCommand ? (
        <p className="save-note">대기 중인 명령: {controlState.pendingCommand.type}</p>
      ) : null}
      {controlState?.commandError ? <p className="warning-line">{controlState.commandError}</p> : null}
      {actionError ? <p className="warning-line">{actionError}</p> : null}

      <GeneralControlCommands />
      <ManualJoystick />
    </div>
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

function formatReason(reason: string) {
  return reasonLabels[reason] ?? reason;
}
