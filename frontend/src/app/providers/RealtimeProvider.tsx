import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';
import { createStompClient } from '../../shared/realtime/stompClient';
import { applyRealtimeMessage } from '../../shared/realtime/realtimeHandlers';
import { parseTopicMessage } from '../../shared/realtime/topicRouter';
import { env } from '../../shared/config/env';
import { useAuthStore } from '../../features/auth/authStore';
import { fetchCurrentControlState } from '../../features/control/controlStateApi';
import { useControlStore } from '../../features/control/controlStore';
import { useTelemetryStore } from '../../features/telemetry/telemetryStore';
import { stompTopics } from '../../features/telemetry/stompTopics';
import { useRobotStore } from '../../features/robots/robotStore';

export function RealtimeProvider({ children }: PropsWithChildren) {
  const setConnectionState = useTelemetryStore((state) => state.setConnectionState);
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (!selectedRobotId || !accessToken) {
      setConnectionState('disconnected');
      return;
    }

    const client = createStompClient({
      brokerURL: env.wssUrl,
      enabled: env.enableMockRealtime === false,
      accessToken,
      onStateChange: setConnectionState,
    });

    const applyMessage = (topic: string, body: string) => {
      applyRealtimeMessage(parseTopicMessage(topic, body));
    };
    const unsubscribeRobotTopics = client.subscribeToRobotTopics(selectedRobotId, {
      telemetry: (message) => applyMessage(stompTopics.telemetry(selectedRobotId), message.body),
      status: (message) => applyMessage(stompTopics.status(selectedRobotId), message.body),
      events: (message) => applyMessage(stompTopics.events(selectedRobotId), message.body),
      controlLock: (message) => applyMessage(stompTopics.controlLock(selectedRobotId), message.body),
      controlEvents: (message) => applyMessage(stompTopics.controlEvents(selectedRobotId), message.body),
    });

    let active = true;

    if (env.enableMockRealtime === false) {
      void fetchCurrentControlState(selectedRobotId)
        .then((snapshot) => {
          if (active) {
            useControlStore.getState().applyLockSnapshot(snapshot);
          }
        })
        .catch((error) => {
          if (active) {
            useControlStore
              .getState()
              .setCommandError(selectedRobotId, error instanceof Error ? error.message : '제어 상태를 조회하지 못했습니다.');
          }
        })
        .finally(() => {
          if (active) {
            client.activate();
          }
        });
    } else {
      client.activate();
    }

    return () => {
      active = false;
      unsubscribeRobotTopics();
      client.deactivate();
    };
  }, [accessToken, selectedRobotId, setConnectionState]);

  return children;
}
