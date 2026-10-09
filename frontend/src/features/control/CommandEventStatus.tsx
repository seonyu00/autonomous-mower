import { useControlStore } from './controlStore';
import type { ControlCommandEvent } from './types';

const statusLabels: Record<ControlCommandEvent['status'], string> = {
  accepted: '명령 접수',
  rejected: '명령 거부',
  'sent-to-edge': 'MQTT 발행 처리됨 · 장비 수신 미확인',
  'edge-ack': '장비 수신 확인 · 실행 완료 미확인',
  executing: '장비 실행 중 응답 · 완료 미확인',
  completed: '장비 실행 완료 응답 확인',
  'edge-timeout': '명령 응답 시간 초과',
  failed: '명령 실패',
};

export function CommandEventStatus({ robotId }: { robotId: string }) {
  const event = useControlStore((state) => state.controlByRobotId[robotId]?.lastCommandEvent);

  if (!event) {
    return null;
  }

  const failed = event.status === 'rejected' || event.status === 'edge-timeout' || event.status === 'failed';

  return (
    <p className={failed ? 'warning-line' : 'save-note'}>
      {statusLabels[event.status]} · {event.commandType}
      {event.reason ? ` · ${event.reason}` : ''}
    </p>
  );
}
