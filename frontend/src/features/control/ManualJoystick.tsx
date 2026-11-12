import { useEffect, useRef, useState } from 'react';
import { useRobotStore } from '../robots/robotStore';
import { ControlPrecheckError, prepareManual, rearmManual, requestManualChallenge, sendManualCommand, sendStopCommand } from './controlApi';
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
  const [armId, setArmId] = useState<string | null>(null);
  const [armConfirmedAt, setArmConfirmedAt] = useState<string | null>(null);
  const [pendingArmId, setPendingArmId] = useState<string | null>(null);
  const [pendingPrepareId, setPendingPrepareId] = useState<string | null>(null);
  const [rearmInFlight, setRearmInFlight] = useState(false);
  const setupGeneration = useRef(0);
  const setup = useRef<{ robotId: string; sessionVersion: number; lockVersion: number } | null>(null);
  const cancelSetupRef = useRef<() => void>(() => {});
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  useAuthStore((state) => state.user);
  useAuthStore((state) => state.isAuthenticated);
  useTelemetryStore((state) => state.connectionState);
  useTelemetryStore((state) => state.protocolState);
  const edgeStatus = useTelemetryStore((state) => selectedRobotId ? state.statusByRobotId[selectedRobotId] : undefined);
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
  const disabled = !selectedRobotId || !eligibility.allowed || !armId;
  const disabledReason = eligibility.reasons[0] ? formatControlReason(eligibility.reasons[0]) : null;

  cancelSetupRef.current = () => {
    const previous = setup.current;
    setup.current = null;
    setupGeneration.current += 1;
    setPendingPrepareId(null);
    setPendingArmId(null);
    setRearmInFlight(false);
    if (previous && previous.sessionVersion === useAuthStore.getState().sessionVersion) {
      void sendStopCommand(previous.robotId, { allowUnselected: true }).catch(() => {
        setLocalError('준비 취소의 장비 수신을 확인하지 못했습니다. 다시 재개하기 전에 상태를 확인해 주세요.');
      });
    }
  };

  useEffect(() => {
    const cancel = () => cancelSetupRef.current();
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    window.addEventListener('blur', cancel);
    window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancel();
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pagehide', cancel);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    cancelSetupRef.current();
    setArmId(null);
    setArmConfirmedAt(null);
    setPendingArmId(null);
  }, [selectedRobotId, sessionVersion, controlState?.lockVersion]);

  useEffect(() => {
    if (!eligibility.allowed) {
      cancelSetupRef.current();
      setArmId(null);
      setArmConfirmedAt(null);
      setPendingArmId(null);
    }
  }, [eligibility.allowed]);

  useEffect(() => {
    if (!pendingPrepareId) return;
    const timeout = window.setTimeout(() => {
      cancelSetupRef.current();
      setLocalError('수동 조작 준비 시간이 초과됐습니다. 연결과 리모컨 상태를 확인해 주세요.');
    }, 30000);
    return () => window.clearTimeout(timeout);
  }, [pendingPrepareId]);

  useEffect(() => {
    if (!pendingArmId) return;
    const timeout = window.setTimeout(() => {
      cancelSetupRef.current();
      setLocalError('장비의 재개 응답이 없습니다. 연결과 리모컨 상태를 확인해 주세요.');
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [pendingArmId]);

  const event = controlState?.lastCommandEvent;
  useEffect(() => {
    if (!event) return;
    if (pendingPrepareId && event.commandId === pendingPrepareId) {
      if (event.status === 'completed') {
        setPendingPrepareId(null);
        const context = setup.current;
        const generation = setupGeneration.current;
        if (context) {
          setRearmInFlight(true);
          void (async () => {
            const stillCurrent = () => setupGeneration.current === generation && setup.current === context &&
              useAuthStore.getState().sessionVersion === context.sessionVersion &&
              useRobotStore.getState().selectedRobotId === context.robotId &&
              useControlStore.getState().getControlState(context.robotId).lockVersion === context.lockVersion &&
              canControlRobot(context.robotId).allowed;
            try {
              const { challenge } = await requestManualChallenge(context.robotId, { purpose: 'rearm' });
              if (!stillCurrent()) return;
              const result = await rearmManual(context.robotId, challenge);
              if (!stillCurrent()) return;
              if (!result.commandId) throw new Error('장비 응답을 확인할 수 없습니다.');
              setPendingArmId(result.commandId);
            } catch (error) {
              if (stillCurrent()) {
                cancelSetupRef.current();
                setLocalError(error instanceof Error ? error.message : '재개 요청을 처리하지 못했습니다.');
              }
            } finally {
              if (setupGeneration.current === generation) setRearmInFlight(false);
            }
          })();
        }
      } else if (['failed', 'rejected', 'edge-timeout'].includes(event.status)) {
        cancelSetupRef.current();
        setLocalError('수동 조작을 준비하지 못했습니다. 시리얼 포트와 리모컨 상태를 확인해 주세요.');
      }
    }
    if (pendingArmId && event.commandId === pendingArmId) {
      if (event.status === 'edge-ack' && event.edgeAckAt) {
        setArmId(pendingArmId);
        setArmConfirmedAt(event.edgeAckAt);
        setPendingArmId(null);
        setup.current = null;
      } else if (event.status === 'failed' || event.status === 'rejected' || event.status === 'edge-timeout') {
        cancelSetupRef.current();
        setPendingArmId(null);
        setLocalError('장비가 수동 조작 재개를 확인하지 못했습니다. 리모컨 상태를 확인해 주세요.');
      }
    }
    if (event.commandType === 'manual-command' && event.status === 'failed' &&
        ['manual-not-armed', 'manual-input-time-invalid', 'manual-challenge-invalid', 'stale-command', 'invalid-speed'].includes(event.reason ?? '')) {
      inputRef.current?.stop();
      setArmId(null);
      setArmConfirmedAt(null);
      setLocalError('리모컨 우선 또는 연결 문제로 수동 조작이 잠겼습니다. 상태를 확인한 후 다시 재개해 주세요.');
    }
  }, [event, pendingArmId, pendingPrepareId]);

  useEffect(() => {
    if (armId && armConfirmedAt && edgeStatus?.edgeState === 'manual-serial-locked' && edgeStatus.lastSeenAt &&
        Date.parse(edgeStatus.lastSeenAt) >= Date.parse(armConfirmedAt)) {
      inputRef.current?.stop();
      setArmId(null);
      setArmConfirmedAt(null);
      setLocalError('리모컨 개입 또는 통신 문제로 수동 조작이 잠겼습니다. 확인 후 다시 재개해 주세요.');
    }
  }, [armId, armConfirmedAt, edgeStatus]);

  const requestRearm = async () => {
    if (!selectedRobotId || !eligibility.allowed || pendingArmId || pendingPrepareId || rearmInFlight) return;
    setArmId(null);
    setArmConfirmedAt(null);
    setLocalError(null);
    setRearmInFlight(true);
    const generation = ++setupGeneration.current;
    try {
      const version = useControlStore.getState().getControlState(selectedRobotId).lockVersion;
      setup.current = { robotId: selectedRobotId, sessionVersion, lockVersion: version };
      const { challenge } = await requestManualChallenge(selectedRobotId, { purpose: 'rearm' });
      if (setupGeneration.current !== generation || useRobotStore.getState().selectedRobotId !== selectedRobotId ||
          useAuthStore.getState().sessionVersion !== sessionVersion ||
          useControlStore.getState().getControlState(selectedRobotId).lockVersion !== version ||
          !canControlRobot(selectedRobotId).allowed) return;
      const result = await prepareManual(selectedRobotId, challenge);
      if (setupGeneration.current !== generation) return;
      if (!result.commandId) throw new Error('장비 응답을 확인할 수 없습니다.');
      setPendingPrepareId(result.commandId);
    } catch (error) {
      if (setupGeneration.current === generation) {
        cancelSetupRef.current();
        setLocalError(error instanceof Error ? error.message : '재개 요청을 처리하지 못했습니다.');
      }
    } finally {
      if (setupGeneration.current === generation) setRearmInFlight(false);
    }
  };

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
    const requestStop = async (command?: ManualCommand) => {
      if (!selectedRobotId || stopInFlight.current || !currentSession()) return;
      stopInFlight.current = true;
      try {
        await sendStopCommand(selectedRobotId, { allowUnselected: true, armId: command?.armId, pressId: command?.pressId });
      } catch (error) {
        reportError(error);
      } finally {
        stopInFlight.current = false;
      }
    };
    const stop = (pointerId?: number) => {
      if (!input || (pointerId !== undefined && input.pointerId !== pointerId)) return;
      const stopped = input.command;
      input = null;
      window.clearInterval(timer);
      timer = undefined;
      void requestStop(stopped);
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
        const { challenge } = await requestManualChallenge(selectedRobotId, {
          purpose: 'movement', armId: sent.command.armId, pressId: sent.command.pressId,
          direction: sent.command.direction, speed: sent.command.speed,
        });
        if (!alive || input !== sent || !currentSession() || !canControlRobot(selectedRobotId).allowed) return;
        await sendManualCommand(selectedRobotId, { ...sent.command, challenge });
      } catch (error) {
        reportError(error);
        stop();
      } finally {
        manualInFlight.current = false;
        // 먼저 보낸 이동 요청이 늦게 끝난 경우 정지를 한 번 더 시도한다.
        if (!input) void requestStop(sent.command);
      }
    };
    inputRef.current = {
      start: (direction, speed, pointerId) => {
        if (!selectedRobotId || !canControlRobot(selectedRobotId).allowed) return;
        if (direction === 'stop') {
          cancelSetupRef.current();
          if (input) stop();
          else {
            setArmId(null);
            setArmConfirmedAt(null);
            void requestStop();
          }
          return;
        }
        if (disabled) return;
        if (input) return;
        if (stopInFlight.current || (!input && manualInFlight.current)) return;
        setLocalError(null);
        const pressId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        input = { command: { action: 'manual', robotId: selectedRobotId, direction, speed, armId: armId ?? undefined, pressId }, pointerId };
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
  }, [selectedRobotId, disabled, sessionVersion, armId]);

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

      <button type="button" onClick={() => void requestRearm()} disabled={!eligibility.allowed || Boolean(pendingArmId) || Boolean(pendingPrepareId) || rearmInFlight}>
        {pendingPrepareId || rearmInFlight ? '수동 조작 준비 중' : pendingArmId ? '장비 응답 대기 중' : armId ? '수동 조작 다시 준비' : '수동 조작 재개'}
      </button>
      <p className="muted">주변 안전을 확인한 뒤 재개하세요. 방향 버튼은 누르는 동안에만 작동하며 리모컨 조작 시 웹 제어가 잠깁니다.</p>

      <div className="joystick-grid" aria-disabled={disabled}>
        {directionButtons.map((item) => (
          <button
            key={item.direction}
            className={`joystick-button ${item.direction}`}
            type="button"
            disabled={item.direction === 'stop' ? !eligibility.allowed : disabled}
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
      {pendingPrepareId || rearmInFlight || pendingArmId ? <>
        <p className="muted">장비의 연결과 중립 상태를 확인하고 있습니다.</p>
        <button type="button" onClick={() => cancelSetupRef.current()}>준비 취소</button>
      </> : null}
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
