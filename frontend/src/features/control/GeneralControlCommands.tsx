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
  { label: 'Blade Start', action: 'blade-start' },
  { label: 'Blade Stop', action: 'blade-stop' },
  { label: 'Raise', action: 'raise' },
  { label: 'Lower', action: 'lower' },
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
      setLocalError(formatError(error, 'Mode change failed.'));
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
      setLocalError(formatError(error, 'Mower attachment command failed.'));
    }
  };

  return (
    <section className="general-control-commands" aria-label="Mode and mower attachment commands">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Commands</p>
          <h2>Mode and Attachment</h2>
        </div>
        <span className={disabled ? 'status-pill degraded' : 'status-pill connected'}>
          {disabled ? 'blocked' : 'ready'}
        </span>
      </div>

      <div className="command-section">
        <strong>Mode</strong>
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
        <strong>Work</strong>
        <div className="command-actions">
          <Button type="button" variant="primary" disabled={disabled} onClick={() => void handleMode('autonomous')}>
            Start Work
          </Button>
          <Button type="button" disabled={disabled} onClick={() => void handleMode('idle')}>
            Stop Work
          </Button>
        </div>
      </div>

      <div className="command-section">
        <strong>Mower Attachment</strong>
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
