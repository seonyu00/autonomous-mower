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
import { mockTelemetry } from '../../features/telemetry/mockTelemetry';
import { stompTopics } from '../../features/telemetry/stompTopics';
import { useRobotStore } from '../../features/robots/robotStore';

export function RealtimeProvider({ children }: PropsWithChildren) {
  const setConnectionState = useTelemetryStore((state) => state.setConnectionState);
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const accessToken = useAuthStore((state) => state.accessToken);

  const sessionVersion = useAuthStore((state) => state.sessionVersion);

  useEffect(() => {
    if (!selectedRobotId || !accessToken) {
      setConnectionState('disconnected');
      return;
    }

    let active = true;
    const isCurrentSession = () => active && useAuthStore.getState().sessionVersion === sessionVersion
      && useAuthStore.getState().accessToken === accessToken;

    if (env.enableMockRealtime) {
      useTelemetryStore.setState({ dataSource: 'mock', telemetryByRobotId: mockTelemetry });
    }

    const client = createStompClient({
      brokerURL: env.wssUrl,
      enabled: env.enableMockRealtime === false,
      accessToken,
      onStateChange: (state) => { if (isCurrentSession()) setConnectionState(state); },
    });

    const applyMessage = (topic: string, body: string) => {
      if (isCurrentSession()) applyRealtimeMessage(parseTopicMessage(topic, body));
    };
    const unsubscribeRobotTopics = client.subscribeToRobotTopics(selectedRobotId, {
      telemetry: (message) => applyMessage(stompTopics.telemetry(selectedRobotId), message.body),
      status: (message) => applyMessage(stompTopics.status(selectedRobotId), message.body),
      events: (message) => applyMessage(stompTopics.events(selectedRobotId), message.body),
      controlLock: (message) => applyMessage(stompTopics.controlLock(selectedRobotId), message.body),
      controlEvents: (message) => applyMessage(stompTopics.controlEvents(selectedRobotId), message.body),
    });

    if (env.enableMockRealtime === false) {
      void fetchCurrentControlState(selectedRobotId)
        .then((snapshot) => {
          if (isCurrentSession()) {
            useControlStore.getState().applyLockSnapshot(snapshot);
          }
        })
        .catch((error) => {
          if (isCurrentSession()) {
            useControlStore
              .getState()
              .setCommandError(selectedRobotId, error instanceof Error ? error.message : '제어 상태를 조회하지 못했습니다.');
          }
        })
        .finally(() => {
          if (isCurrentSession()) {
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
  }, [accessToken, sessionVersion, selectedRobotId, setConnectionState]);

  return children;
}
