import { Client } from '@stomp/stompjs';
import type { RealtimeConnectionState } from '../../features/telemetry/types';

type StompClientOptions = {
  brokerURL: string;
  enabled: boolean;
  onStateChange: (state: RealtimeConnectionState) => void;
};

export type StompClientHandle = {
  activate: () => void;
  deactivate: () => void;
};

export function createStompClient({ brokerURL, enabled, onStateChange }: StompClientOptions): StompClientHandle {
  if (!enabled) {
    return {
      activate: () => onStateChange('connected'),
      deactivate: () => onStateChange('disconnected'),
    };
  }

  const client = new Client({
    brokerURL,
    reconnectDelay: 3000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    onConnect: () => onStateChange('connected'),
    onDisconnect: () => onStateChange('disconnected'),
    onStompError: () => onStateChange('degraded'),
    onWebSocketClose: () => onStateChange('reconnecting'),
  });

  return {
    activate: () => {
      onStateChange('connecting');
      client.activate();
    },
    deactivate: () => {
      void client.deactivate();
      onStateChange('disconnected');
    },
  };
}
