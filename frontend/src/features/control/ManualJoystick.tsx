import { useEffect, useRef, useState } from 'react';
import { useRobotStore } from '../robots/robotStore';
import { ControlPrecheckError, sendManualCommand, sendStopCommand } from './controlApi';
import { canControlRobot } from './controlSelectors';
import { useAuthStore } from '../auth/authStore';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { createDefaultControlState, useControlStore } from './controlStore';
import type { ManualCommand, ManualDirection } from './types';
import { formatControlReason } from './controlReasonLabels';

const INPUT_INTERVAL_MS = 100;

const directionButtons: Array<{ direction: ManualDirection; label: string; speed: number }> = [
  { direction: 'forward', label: '전진', speed: 0.6 },
  { direction: 'left', label: '좌회전', speed: 0.35 },
  { direction: 'stop', label: '정지', speed: 0 },
  { direction: 'right', label: '우회전', speed: 0.35 },
  { direction: 'reverse', label: '후진', speed: 0.45 },
];

type ManualJoystickProps = {
  compact?: boolean;
};

export function ManualJoystick({ compact = false }: ManualJoystickProps) {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const controlByRobotId = useControlStore((state) => state.controlByRobotId);
  const [localError, setLocalError] = useState<string | null>(null);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  useAuthStore((state) => state.user);
  useAuthStore((state) => state.isAuthenticated);
  useTelemetryStore((state) => state.connectionState);
  useTelemetryStore((state) => state.protocolState);
  const manualInFlight = useRef(false);
  const stopInFlight = useRef(false);
  const inputRef = useRef<{
    start: (direction: ManualDirection, speed: number, pointerId: number) => void;
    stop: (pointerId?: number) => void;
  } | null>(null);

  const controlState = selectedRobotId
    ? controlByRobotId[selectedRobotId] ?? createDefaultControlState(selectedRobotId)
    : null;
  const eligibility = selectedRobotId ? canControlRobot(selectedRobotId) : { allowed: false, reasons: ['robot-not-selected'] };
  const disabled = !selectedRobotId || !eligibility.allowed;
  const disabledReason = eligibility.reasons[0] ? formatControlReason(eligibility.reasons[0]) : null;

  useEffect(() => {
    let alive = true;
    let input: { command: ManualCommand; pointerId: number } | null = null;
    let timer: number | undefined;
    const currentSession = () => useAuthStore.getState().sessionVersion === sessionVersion;
    const reportError = (error: unknown) => {
      if (!alive || !currentSession()) return;
      setLocalError(error instanceof ControlPrecheckError
        ? error.reasons.map(formatControlReason).join(' ')
        : error instanceof Error ? error.message : '수동 명령을 처리하지 못했습니다.');
    };
    const requestStop = async () => {
      if (!selectedRobotId || stopInFlight.current || !currentSession()) return;
      stopInFlight.current = true;
      try {
        await sendStopCommand(selectedRobotId, { allowUnselected: true });
      } catch (error) {
        reportError(error);
      } finally {
        stopInFlight.current = false;
      }
    };
    const stop = (pointerId?: number) => {
      if (!input || (pointerId !== undefined && input.pointerId !== pointerId)) return;
      input = null;
      window.clearInterval(timer);
      timer = undefined;
      void requestStop();
    };
    const tick = async () => {
      if (!input || !selectedRobotId) return;
      if (!currentSession() || !canControlRobot(selectedRobotId).allowed) {
        stop();
        return;
      }
      // 대기 중인 이동 요청은 한 개로 제한하고 중간 입력은 큐에 저장하지 않는다.
      if (manualInFlight.current || stopInFlight.current) return;
      const sent = input;
      manualInFlight.current = true;
      try {
        await sendManualCommand(selectedRobotId, sent.command);
      } catch (error) {
        reportError(error);
        stop();
      } finally {
        manualInFlight.current = false;
        // 먼저 보낸 이동 요청이 늦게 끝난 경우 정지를 한 번 더 시도한다.
        if (!input) void requestStop();
      }
    };
    inputRef.current = {
      start: (direction, speed, pointerId) => {
        if (disabled || !selectedRobotId || !canControlRobot(selectedRobotId).allowed) return;
        if (direction === 'stop') {
          if (input) stop();
          else void requestStop();
          return;
        }
        if (stopInFlight.current || (!input && manualInFlight.current)) return;
        setLocalError(null);
        input = { command: { action: 'manual', robotId: selectedRobotId, direction, speed }, pointerId };
        if (timer === undefined) timer = window.setInterval(() => void tick(), INPUT_INTERVAL_MS);
        void tick();
      },
      stop,
    };
    const stopAll = () => stop();
    const release = (event: PointerEvent) => stop(event.pointerId);
    const visibility = () => { if (document.visibilityState === 'hidden') stop(); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', stopAll);
    window.addEventListener('pagehide', stopAll);
    window.addEventListener('beforeunload', stopAll);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive = false;
      stop();
      inputRef.current = null;
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', stopAll);
      window.removeEventListener('pagehide', stopAll);
      window.removeEventListener('beforeunload', stopAll);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [selectedRobotId, disabled, sessionVersion]);

  return (
    <div className={compact ? 'manual-joystick compact' : 'manual-joystick'} aria-label="수동 조이스틱 제어">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">04 · 수동 개입</p>
          <h2>방향 제어</h2>
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
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              inputRef.current?.start(item.direction, item.speed, event.pointerId);
            }}
            onPointerUp={(event) => inputRef.current?.stop(event.pointerId)}
            onPointerCancel={(event) => inputRef.current?.stop(event.pointerId)}
            onLostPointerCapture={(event) => inputRef.current?.stop(event.pointerId)}
            style={{ touchAction: 'none' }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {compact && disabledReason ? <span className="compact-disabled-reason">{disabledReason}</span> : null}

      {!compact ? <div className="control-summary">
        <Metric label="수동 활성" value={controlState?.manualActive ? '예' : '아니요'} />
        <Metric label="마지막 입력" value={controlState?.lastInputAt ? new Date(controlState.lastInputAt).toLocaleTimeString() : '없음'} />
      </div> : null}

      {!compact && controlState?.lastCommandPayload ? (
        <pre className="payload-preview">{JSON.stringify(controlState.lastCommandPayload, null, 2)}</pre>
      ) : !compact ? (
        <p className="muted">조이스틱을 입력하면 명령 payload가 여기에 표시됩니다.</p>
      ) : null}

      {!compact && disabled && eligibility.reasons.length > 0 ? (
        <p className="warning-line">{eligibility.reasons.map(formatControlReason).join(' ')}</p>
      ) : null}
      {localError ? <p className="warning-line">{localError}</p> : null}
      {!compact && controlState?.commandError ? <p className="warning-line">{controlState.commandError}</p> : null}
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
