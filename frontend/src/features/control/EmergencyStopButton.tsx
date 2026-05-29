import { useState } from 'react';
import { Dialog } from '../../shared/ui/Dialog';
import { useRobotStore } from '../robots/robotStore';
import { useControlStore } from './controlStore';
import { canSendEmergencyStop } from './controlSelectors';
import { ControlPrecheckError, sendEmergencyStop } from './controlApi';

const reasonLabels: Record<string, string> = {
  'not-authenticated': 'Authenticated operator session is required.',
  'missing-control-permission': 'Current role does not have E-Stop permission.',
  'robot-not-selected': 'Select a robot before sending E-Stop.',
  'transport-not-ready': 'Secure transport is not ready.',
};

export function EmergencyStopButton() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const controlByRobotId = useControlStore((state) => state.controlByRobotId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controlState = selectedRobotId ? controlByRobotId[selectedRobotId] : null;
  const emergencyActive = Boolean(controlState?.emergency || controlState?.mode === 'emergency');
  const eligibility = selectedRobotId
    ? canSendEmergencyStop(selectedRobotId)
    : { allowed: false, reasons: ['robot-not-selected'] };
  const disabled = !selectedRobotId || emergencyActive || !eligibility.allowed;

  const handleConfirm = async () => {
    if (!selectedRobotId) {
      setError('No robot selected.');
      return;
    }

    setError(null);

    try {
      await sendEmergencyStop(selectedRobotId);
      setConfirmOpen(false);
    } catch (caught) {
      if (caught instanceof ControlPrecheckError) {
        setError(caught.reasons.map(formatReason).join(' '));
        return;
      }

      setError(caught instanceof Error ? caught.message : 'Emergency stop failed.');
    }
  };

  return (
    <div className="global-estop">
      <button
        className="estop-button"
        type="button"
        aria-label={selectedRobotId ? `Emergency stop ${selectedRobotId}` : 'Emergency stop unavailable'}
        disabled={disabled}
        onClick={() => setConfirmOpen(true)}
      >
        E-STOP
      </button>
      <span className={emergencyActive ? 'estop-state active' : 'estop-state'}>
        {emergencyActive ? 'Emergency active' : 'Ready'}
      </span>

      <Dialog title="Confirm Emergency Stop" open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="estop-dialog-content">
          <p>
            This will immediately request all drive and mower outputs to stop for{' '}
            <strong>{selectedRobotId ?? 'the selected robot'}</strong>.
          </p>
          <p className="warning-line">After E-Stop, previous commands must not resume automatically.</p>
          {eligibility.reasons.length > 0 ? (
            <ul className="validation-list">
              {eligibility.reasons.map((reason) => (
                <li key={reason}>{formatReason(reason)}</li>
              ))}
            </ul>
          ) : null}
          {error ? <p className="warning-line">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button
              className="danger-button"
              type="button"
              aria-label="Confirm emergency stop command"
              disabled={!eligibility.allowed}
              onClick={() => void handleConfirm()}
            >
              Confirm E-Stop
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function formatReason(reason: string) {
  return reasonLabels[reason] ?? reason;
}
