import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';
import { createStompClient } from '../../shared/realtime/stompClient';
import { env } from '../../shared/config/env';
import { useTelemetryStore } from '../../features/telemetry/telemetryStore';

export function RealtimeProvider({ children }: PropsWithChildren) {
  const setConnectionState = useTelemetryStore((state) => state.setConnectionState);

  useEffect(() => {
    const client = createStompClient({
      brokerURL: env.wssUrl,
      enabled: env.enableMockRealtime === false,
      onStateChange: setConnectionState,
    });

    client.activate();

    return () => {
      client.deactivate();
    };
  }, [setConnectionState]);

  return children;
}
