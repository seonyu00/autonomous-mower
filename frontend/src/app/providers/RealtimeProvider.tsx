import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';
import { createStompClient } from '../../shared/realtime/stompClient';
import { env } from '../../shared/config/env';
import { useTelemetryStore } from '../../features/telemetry/telemetryStore';
import { useRobotStore } from '../../features/robots/robotStore';

export function RealtimeProvider({ children }: PropsWithChildren) {
  const setConnectionState = useTelemetryStore((state) => state.setConnectionState);
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);

  useEffect(() => {
    const client = createStompClient({
      brokerURL: env.wssUrl,
      enabled: env.enableMockRealtime === false,
      onStateChange: setConnectionState,
    });

    client.activate();
    const unsubscribeRobotTopics = selectedRobotId
      ? client.subscribeToRobotTopics(selectedRobotId, {
          controlLock: () => undefined,
          status: () => undefined,
          events: () => undefined,
        })
      : null;

    return () => {
      unsubscribeRobotTopics?.();
      client.deactivate();
    };
  }, [selectedRobotId, setConnectionState]);

  return children;
}
