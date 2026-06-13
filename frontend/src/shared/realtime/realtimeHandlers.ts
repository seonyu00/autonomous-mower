import { useControlStore } from '../../features/control/controlStore';
import { useRobotStore } from '../../features/robots/robotStore';
import { useTelemetryStore } from '../../features/telemetry/telemetryStore';
import type { TopicMessage } from './topicRouter';

export function applyRealtimeMessage(message: TopicMessage) {
  if (message.type === 'telemetry') {
    useTelemetryStore.getState().upsertTelemetry(message.payload);
    const emergency = message.payload.mode === 'emergency';
    useControlStore.getState().patchControlState(message.payload.robotId, {
      mode: message.payload.mode,
      emergency,
      ...(emergency ? { manualActive: false } : {}),
    });
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
