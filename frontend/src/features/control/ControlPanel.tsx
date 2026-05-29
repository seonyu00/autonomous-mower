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
  'not-authenticated': 'Authenticated operator session is required.',
  'missing-control-permission': 'Current role does not have control permission.',
  'robot-not-selected': 'Selected robot does not match this control panel.',
  'control-lock-not-held': 'Manual control lock is not held.',
  'control-owned-by-other-user': 'Control lock is owned by another user.',
  'realtime-connecting': 'Realtime connection is still connecting.',
  'realtime-reconnecting': 'Realtime connection is reconnecting.',
  'realtime-degraded': 'Realtime connection is degraded.',
  'realtime-disconnected': 'Realtime connection is disconnected.',
  'robot-in-emergency': 'Robot is in emergency state.',
  'robot-not-in-emergency': 'Robot is not in emergency state.',
  'transport-not-ready': 'Secure transport is not ready.',
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
      setActionError('No robot selected.');
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

      setActionError(error instanceof Error ? error.message : 'Control action failed.');
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
          <p className="eyebrow">Phase 3</p>
          <h2>Control Ownership</h2>
        </div>
        <span className={eligibility.allowed ? 'status-pill connected' : 'status-pill degraded'}>
          {eligibility.allowed ? 'controllable' : 'locked'}
        </span>
      </div>

      <div className="control-summary">
        <Metric label="Robot" value={selectedRobotId ?? 'None'} />
        <Metric label="Lock" value={controlState?.lockState ?? 'none'} />
        <Metric label="Owner" value={controlState?.controlOwner ?? 'Unassigned'} />
        <Metric label="Mode" value={controlState?.mode ?? 'idle'} />
        <Metric label="Emergency" value={emergencyActive ? 'active' : 'clear'} />
        <Metric label="Realtime" value={connectionState} />
        <Metric label="WSS" value={protocolState.wss} />
      </div>

      {emergencyActive ? (
        <section className="estop-recovery-panel" aria-label="Emergency recovery status">
          <strong>E-Stop is active.</strong>
          <p>Previous commands are blocked and will not resume automatically. Reset only returns the robot to idle.</p>
          <Button type="button" disabled={!resetEligibility.allowed} onClick={() => void handleAction('reset-after-emergency')}>
            Reset After Emergency
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

      <div className="lock-state-list" aria-label="Control lock state list">
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
          Request Control
        </Button>
        <Button
          type="button"
          disabled={emergencyActive || !selectedRobotId || !ownedByCurrentUser}
          onClick={() => void handleAction('release')}
        >
          Release Control
        </Button>
        <PermissionGate permission="control:takeover">
          <Button
            type="button"
            disabled={emergencyActive || !selectedRobotId || !heldByOther}
            onClick={() => void handleAction('takeover')}
          >
            Take Over
          </Button>
        </PermissionGate>
      </div>

      <section className="control-reasons" aria-label="Control eligibility">
        <strong>{eligibility.allowed ? 'Control precheck passed.' : 'Control unavailable.'}</strong>
        {eligibility.reasons.length > 0 ? (
          <ul>
            {eligibility.reasons.map((reason) => (
              <li key={reason}>{formatReason(reason)}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {controlState?.pendingCommand ? (
        <p className="save-note">Pending command: {controlState.pendingCommand.type}</p>
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
