import { useControlStore } from '../../features/control/controlStore';
import { useRobotStore } from '../../features/robots/robotStore';
import { useTelemetryStore } from '../../features/telemetry/telemetryStore';
import type { TopicMessage } from './topicRouter';
import { useRecentEventsStore } from '../../features/logs/recentEventsStore';
import { env } from '../config/env';

export function applyRealtimeMessage(message: TopicMessage) {
  if (message.type === 'events' && !env.enableMockLogs) {
    useRecentEventsStore.getState().mergeEvents(message.payload.robotId, [message.payload]);
  }
  if (message.type === 'telemetry') {
    useTelemetryStore.getState().upsertTelemetry(message.payload);
    // 모드 미수신은 기존 모드나 긴급 정지를 해제하는 신호가 아니다.
    if (message.payload.mode !== null) {
      const emergency = message.payload.mode === 'emergency';
      useControlStore.getState().patchControlState(message.payload.robotId, {
        mode: message.payload.mode,
        emergency,
        ...(emergency ? { manualActive: false } : {}),
      });
    }
  }

  if (message.type === 'status') {
    useTelemetryStore.getState().upsertStatus(message.payload);
    useRobotStore.getState().setConnectionState(message.payload.robotId, message.payload.connectionState);
  }

  if (message.type === 'control-lock') {
    useControlStore.getState().applyLockSnapshot(message.payload);
  }

  if (message.type === 'control-events') {
    useControlStore.getState().applyCommandEvent(message.payload);
  }
}
