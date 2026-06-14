import { useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { useRobotStore } from '../robots/robotStore';
import { changeMode, ControlPrecheckError, sendMowerAttachmentCommand } from './controlApi';
import { canControlRobot } from './controlSelectors';
import { createDefaultControlState, useControlStore } from './controlStore';
import type { ControlMode, MowerAttachmentAction } from './types';
import { formatControlReason } from './controlReasonLabels';

const modeActions: Array<{ label: string; mode: ControlMode }> = [
  { label: 'AUTO', mode: 'autonomous' },
  { label: 'MANUAL', mode: 'manual' },
  { label: 'HOME', mode: 'home' },
];

const mowerActions: Array<{ label: string; action: MowerAttachmentAction }> = [
  { label: '날 구동', action: 'blade-start' },
  { label: '날 정지', action: 'blade-stop' },
  { label: '상승', action: 'raise' },
  { label: '하강', action: 'lower' },
];

type GeneralControlCommandsProps = {
  compact?: boolean;
};

export function GeneralControlCommands({ compact = false }: GeneralControlCommandsProps) {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const controlByRobotId = useControlStore((state) => state.controlByRobotId);
  const [localError, setLocalError] = useState<string | null>(null);

  const controlState = selectedRobotId
    ? controlByRobotId[selectedRobotId] ?? createDefaultControlState(selectedRobotId)
    : null;
  const eligibility = selectedRobotId ? canControlRobot(selectedRobotId) : { allowed: false, reasons: ['robot-not-selected'] };
  const disabled = !selectedRobotId || !eligibility.allowed || Boolean(controlState?.pendingCommand);
  const disabledReason = eligibility.reasons[0]
    ? formatControlReason(eligibility.reasons[0])
    : controlState?.pendingCommand
      ? '이전 명령 처리를 기다리고 있습니다'
      : null;

  const handleMode = async (mode: ControlMode) => {
    if (!selectedRobotId || disabled) {
      return;
    }

    setLocalError(null);

    try {
      await changeMode(selectedRobotId, mode);
    } catch (error) {
      setLocalError(formatError(error, '모드 변경 요청을 처리하지 못했습니다.'));
    }
  };

  const handleAttachment = async (action: MowerAttachmentAction) => {
    if (!selectedRobotId || disabled) {
      return;
    }

    setLocalError(null);

    try {
      await sendMowerAttachmentCommand(selectedRobotId, action);
    } catch (error) {
      setLocalError(formatError(error, '예초 장치 명령을 처리하지 못했습니다.'));
    }
  };

  return (
    <section className={compact ? 'general-control-commands compact' : 'general-control-commands'} aria-label="모드 및 예초 장치 명령">
      {!compact ? <div className="panel-heading compact">
        <div>
          <p className="eyebrow">명령</p>
          <h2>모드와 작업 장치</h2>
        </div>
        <span className={disabled ? 'status-pill degraded' : 'status-pill connected'}>
          {disabled ? '차단됨' : '준비됨'}
        </span>
      </div> : null}

      <div className="command-section mode-control" aria-label="모드 선택 제어">
        <div className="command-section-heading">
          <span>01</span>
          <strong>모드 선택</strong>
          {!compact ? <small>운용 방식을 먼저 선택합니다.</small> : null}
        </div>
        <div className="command-actions">
          {modeActions.map((item) => (
            <Button
              key={item.mode}
              type="button"
              variant={controlState?.mode === item.mode ? 'primary' : 'secondary'}
              disabled={disabled}
              onClick={() => void handleMode(item.mode)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {compact && disabledReason ? <span className="compact-disabled-reason">{disabledReason}</span> : null}
      </div>

      <div className="command-section work-control" aria-label="작업 제어">
        <div className="command-section-heading">
          <span>02</span>
          <strong>작업 제어</strong>
          {!compact ? <small>선택한 모드에서 작업을 시작하거나 정지합니다.</small> : null}
        </div>
        <div className="command-actions">
          <Button type="button" variant="primary" disabled={disabled} onClick={() => void handleMode('autonomous')}>
            작업 시작
          </Button>
          <Button type="button" disabled={disabled} onClick={() => void handleMode('idle')}>
            작업 정지
          </Button>
        </div>
        {compact && disabledReason ? <span className="compact-disabled-reason">{disabledReason}</span> : null}
      </div>

      <div className="command-section attachment-control" aria-label="예초 장치 제어">
        <div className="command-section-heading">
          <span>03</span>
          <strong>예초 장치</strong>
          {!compact ? <small>작업 장치 출력과 높이를 제어합니다.</small> : null}
        </div>
        <div className="command-actions">
          {mowerActions.map((item) => (
            <Button
              key={item.action}
              type="button"
              disabled={disabled}
              onClick={() => void handleAttachment(item.action)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {compact && disabledReason ? <span className="compact-disabled-reason">{disabledReason}</span> : null}
      </div>

      {!compact && disabled && eligibility.reasons.length > 0 ? (
        <p className="warning-line">{eligibility.reasons.map(formatControlReason).join(' ')}</p>
      ) : null}
      {localError ? <p className="warning-line">{localError}</p> : null}
      {!compact && controlState?.commandError ? <p className="warning-line">{controlState.commandError}</p> : null}
    </section>
  );
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof ControlPrecheckError) {
    return error.reasons.map(formatControlReason).join(' ');
  }

  return error instanceof Error ? error.message : fallback;
}
