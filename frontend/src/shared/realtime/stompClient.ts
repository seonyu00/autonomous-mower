import { Client } from '@stomp/stompjs';
import type { IMessage, StompSubscription } from '@stomp/stompjs';
import type { RealtimeConnectionState } from '../../features/telemetry/types';
import { stompTopics } from '../../features/telemetry/stompTopics';

type StompClientOptions = {
  brokerURL: string;
  enabled: boolean;
  onStateChange: (state: RealtimeConnectionState) => void;
};

export type StompClientHandle = {
  activate: () => void;
  deactivate: () => void;
  subscribe: (destination: string, callback: StompMessageHandler) => StompUnsubscribe;
  publish: (destination: string, body: unknown) => void;
  subscribeToRobotTopics: (robotId: string, handlers: RobotTopicHandlers) => StompUnsubscribe;
};

export type StompMessageHandler = (message: IMessage) => void;
export type StompUnsubscribe = () => void;

export type RobotTopicHandlers = {
  telemetry?: StompMessageHandler;
  status?: StompMessageHandler;
  events?: StompMessageHandler;
  controlLock?: StompMessageHandler;
};

export function createStompClient({ brokerURL, enabled, onStateChange }: StompClientOptions): StompClientHandle {
  if (!enabled) {
    return {
      activate: () => onStateChange('mock'),
      deactivate: () => onStateChange('disconnected'),
      subscribe: () => () => undefined,
      publish: () => undefined,
      subscribeToRobotTopics: () => () => undefined,
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
    subscribe: (destination, callback) => {
      let subscription: StompSubscription | null = null;

      if (client.connected) {
        subscription = client.subscribe(destination, callback);
      }

      return () => {
        subscription?.unsubscribe();
      };
    },
    publish: (destination, body) => {
      if (!client.connected) {
        onStateChange('degraded');
        return;
      }

      client.publish({
        destination,
        body: JSON.stringify(body),
      });
    },
    subscribeToRobotTopics: (robotId, handlers) => {
      const unsubscribers = [
        handlers.telemetry ? subscribeIfPresent(client, stompTopics.telemetry(robotId), handlers.telemetry) : null,
        handlers.status ? subscribeIfPresent(client, stompTopics.status(robotId), handlers.status) : null,
        handlers.events ? subscribeIfPresent(client, stompTopics.events(robotId), handlers.events) : null,
        handlers.controlLock ? subscribeIfPresent(client, stompTopics.controlLock(robotId), handlers.controlLock) : null,
      ].filter((unsubscribe): unsubscribe is StompUnsubscribe => Boolean(unsubscribe));

      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    },
  };
}

function subscribeIfPresent(client: Client, destination: string, callback: StompMessageHandler): StompUnsubscribe | null {
  if (!client.connected) {
    return null;
  }

  const subscription = client.subscribe(destination, callback);

  return () => subscription.unsubscribe();
}
