import { useMemo, useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { useRobotStore } from '../robots/robotStore';
import { changeMode, ControlPrecheckError, sendMowerAttachmentCommand } from './controlApi';
import { canControlRobot } from './controlSelectors';
import { createDefaultControlState, useControlStore } from './controlStore';
import type { ControlMode, MowerAttachmentAction } from './types';

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

export function GeneralControlCommands() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const controlByRobotId = useControlStore((state) => state.controlByRobotId);
  const [localError, setLocalError] = useState<string | null>(null);

  const controlState = selectedRobotId
    ? controlByRobotId[selectedRobotId] ?? createDefaultControlState(selectedRobotId)
    : null;
  const eligibility = selectedRobotId ? canControlRobot(selectedRobotId) : { allowed: false, reasons: ['robot-not-selected'] };
  const disabled = !selectedRobotId || !eligibility.allowed || Boolean(controlState?.pendingCommand);
  const reasonText = useMemo(() => eligibility.reasons.join(', '), [eligibility.reasons]);

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
    <section className="general-control-commands" aria-label="모드 및 예초 장치 명령">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">명령</p>
          <h2>모드와 작업 장치</h2>
        </div>
        <span className={disabled ? 'status-pill degraded' : 'status-pill connected'}>
          {disabled ? '차단됨' : '준비됨'}
        </span>
      </div>

      <div className="command-section">
        <strong>모드</strong>
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
      </div>

      <div className="command-section">
        <strong>작업</strong>
        <div className="command-actions">
          <Button type="button" variant="primary" disabled={disabled} onClick={() => void handleMode('autonomous')}>
            작업 시작
          </Button>
          <Button type="button" disabled={disabled} onClick={() => void handleMode('idle')}>
            작업 정지
          </Button>
        </div>
      </div>

      <div className="command-section">
        <strong>예초 장치</strong>
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
      </div>

      {disabled && reasonText ? <p className="warning-line">{reasonText}</p> : null}
      {localError ? <p className="warning-line">{localError}</p> : null}
      {controlState?.commandError ? <p className="warning-line">{controlState.commandError}</p> : null}
    </section>
  );
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof ControlPrecheckError) {
    return error.reasons.join(', ');
  }

  return error instanceof Error ? error.message : fallback;
}
