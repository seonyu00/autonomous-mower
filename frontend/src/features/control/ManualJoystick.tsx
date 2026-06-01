import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRobotStore } from '../robots/robotStore';
import { ControlPrecheckError, sendManualCommand, sendStopCommand } from './controlApi';
import { canControlRobot } from './controlSelectors';
import { DeadmanSwitch } from './DeadmanSwitch';
import { createDefaultControlState, useControlStore } from './controlStore';
import type { ManualCommand, ManualDirection } from './types';

const DEADMAN_TIMEOUT_MS = 500;

const directionButtons: Array<{ direction: ManualDirection; label: string; speed: number }> = [
  { direction: 'forward', label: '전진', speed: 0.6 },
  { direction: 'left', label: '좌회전', speed: 0.35 },
  { direction: 'stop', label: '정지', speed: 0 },
  { direction: 'right', label: '우회전', speed: 0.35 },
  { direction: 'reverse', label: '후진', speed: 0.45 },
];

export function ManualJoystick() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const controlByRobotId = useControlStore((state) => state.controlByRobotId);
  const [localError, setLocalError] = useState<string | null>(null);
  const stopInFlightRef = useRef(false);
  const deadmanRef = useRef<DeadmanSwitch | null>(null);

  const controlState = selectedRobotId
    ? controlByRobotId[selectedRobotId] ?? createDefaultControlState(selectedRobotId)
    : null;
  const eligibility = selectedRobotId ? canControlRobot(selectedRobotId) : { allowed: false, reasons: ['robot-not-selected'] };
  const disabled = !selectedRobotId || !eligibility.allowed;

  const stopRobot = useCallback(async () => {
    if (!selectedRobotId || stopInFlightRef.current) {
      return;
    }

    deadmanRef.current?.clear();
    stopInFlightRef.current = true;

    try {
      await sendStopCommand(selectedRobotId);
      setLocalError(null);
    } catch (error) {
      if (error instanceof ControlPrecheckError) {
        setLocalError(error.reasons.join(', '));
      } else {
        setLocalError(error instanceof Error ? error.message : '정지 명령을 처리하지 못했습니다.');
      }
    } finally {
      stopInFlightRef.current = false;
    }
  }, [selectedRobotId]);

  useEffect(() => {
    deadmanRef.current = new DeadmanSwitch({
      timeoutMs: DEADMAN_TIMEOUT_MS,
      onTimeout: () => {
        void stopRobot();
      },
    });

    return () => {
      deadmanRef.current?.clear();
    };
  }, [stopRobot]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void stopRobot();
      }
    };
    const handleStopEvent = () => {
      void stopRobot();
    };

    window.addEventListener('blur', handleStopEvent);
    window.addEventListener('pagehide', handleStopEvent);
    window.addEventListener('beforeunload', handleStopEvent);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleStopEvent);
      window.removeEventListener('pagehide', handleStopEvent);
      window.removeEventListener('beforeunload', handleStopEvent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [stopRobot]);

  const sendDirection = async (direction: ManualDirection, speed: number) => {
    if (!selectedRobotId || disabled) {
      return;
    }

    const command: ManualCommand = {
      action: 'manual',
      robotId: selectedRobotId,
      direction,
      speed,
    };

    try {
      if (direction === 'stop') {
        await stopRobot();
      } else {
        deadmanRef.current?.reset();
        await sendManualCommand(selectedRobotId, command);
      }

      setLocalError(null);
    } catch (error) {
      if (error instanceof ControlPrecheckError) {
        setLocalError(error.reasons.join(', '));
      } else {
        setLocalError(error instanceof Error ? error.message : '수동 명령을 처리하지 못했습니다.');
      }
    }
  };

  const reasonText = useMemo(() => eligibility.reasons.join(', '), [eligibility.reasons]);

  return (
    <div className="manual-joystick" aria-label="수동 조이스틱 제어">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">수동</p>
          <h2>조이스틱</h2>
        </div>
        <span className={disabled ? 'status-pill degraded' : 'status-pill connected'}>
          {disabled ? '비활성' : '활성'}
        </span>
      </div>

      <div className="joystick-grid" aria-disabled={disabled}>
        {directionButtons.map((item) => (
          <button
            key={item.direction}
            className={`joystick-button ${item.direction}`}
            type="button"
            disabled={disabled}
            aria-label={`수동 ${item.label}`}
            onPointerDown={() => void sendDirection(item.direction, item.speed)}
            onPointerUp={() => void stopRobot()}
            onPointerCancel={() => void stopRobot()}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="control-summary">
        <Metric label="수동 활성" value={controlState?.manualActive ? '예' : '아니요'} />
        <Metric label="마지막 입력" value={controlState?.lastInputAt ? new Date(controlState.lastInputAt).toLocaleTimeString() : '없음'} />
      </div>

      {controlState?.lastCommandPayload ? (
        <pre className="payload-preview">{JSON.stringify(controlState.lastCommandPayload, null, 2)}</pre>
      ) : (
        <p className="muted">조이스틱을 입력하면 명령 payload가 여기에 표시됩니다.</p>
      )}

      {disabled && reasonText ? <p className="warning-line">{reasonText}</p> : null}
      {localError ? <p className="warning-line">{localError}</p> : null}
      {controlState?.commandError ? <p className="warning-line">{controlState.commandError}</p> : null}
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
