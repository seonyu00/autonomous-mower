import { useState } from 'react';
import { Dialog } from '../../shared/ui/Dialog';
import { useRobotStore } from '../robots/robotStore';
import { useControlStore } from './controlStore';
import { canSendEmergencyStop } from './controlSelectors';
import { ControlPrecheckError, sendEmergencyStop } from './controlApi';

const reasonLabels: Record<string, string> = {
  'not-authenticated': '작업자 세션이 없습니다.',
  'missing-control-permission': '현재 역할로는 긴급 정지(E-Stop)를 보낼 수 없습니다.',
  'robot-not-selected': '먼저 로봇을 선택합니다.',
  'transport-not-ready': '보안 연결이 아직 준비되지 않았습니다.',
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
      setError('먼저 로봇을 선택합니다.');
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

      setError(caught instanceof Error ? caught.message : '긴급 정지(E-Stop) 요청을 처리하지 못했습니다.');
    }
  };

  return (
    <div className="global-estop">
      <button
        className="estop-button"
        type="button"
        aria-label={selectedRobotId ? `${selectedRobotId} 긴급 정지` : '긴급 정지를 사용할 수 없음'}
        disabled={disabled}
        onClick={() => setConfirmOpen(true)}
      >
        E-STOP
      </button>
      <span className={emergencyActive ? 'estop-state active' : 'estop-state'}>
        {emergencyActive ? '긴급 정지 활성' : '준비'}
      </span>

      <Dialog title="긴급 정지 확인" open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="estop-dialog-content">
          <p>
            <strong>{selectedRobotId ?? '선택한 로봇'}</strong>의 모든 주행 및 예초 출력을 즉시 정지하도록 요청합니다.
          </p>
          <p className="warning-line">긴급 정지(E-Stop) 후에는 이전 명령을 자동으로 재개하지 않습니다.</p>
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
              취소
            </button>
            <button
              className="danger-button"
              type="button"
              aria-label="긴급 정지 명령 확인"
              disabled={!eligibility.allowed}
              onClick={() => void handleConfirm()}
            >
              긴급 정지 실행
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
