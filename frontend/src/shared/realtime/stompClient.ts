import { Client, ReconnectionTimeMode } from '@stomp/stompjs';
import type { IMessage, StompSubscription } from '@stomp/stompjs';
import type { RealtimeConnectionState } from '../../features/telemetry/types';
import { stompTopics } from '../../features/telemetry/stompTopics';

type StompClientOptions = {
  brokerURL: string;
  enabled: boolean;
  accessToken: string | null;
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
  controlEvents?: StompMessageHandler;
};

type RobotTopicRegistration = {
  robotId: string;
  handlers: RobotTopicHandlers;
  subscriptions: StompSubscription[];
};

export function createStompClient({
  brokerURL,
  enabled,
  accessToken,
  onStateChange,
}: StompClientOptions): StompClientHandle {
  if (!enabled) {
    return {
      activate: () => onStateChange('mock'),
      deactivate: () => onStateChange('disconnected'),
      subscribe: () => () => undefined,
      publish: () => undefined,
      subscribeToRobotTopics: () => () => undefined,
    };
  }

  const registrations = new Set<RobotTopicRegistration>();
  const client = new Client({
    brokerURL,
    connectHeaders: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : {},
    reconnectDelay: 3000,
    maxReconnectDelay: 10000,
    reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    onConnect: () => {
      onStateChange('connected');
      registrations.forEach((registration) => subscribeRegistration(client, registration));
    },
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
      const registration: RobotTopicRegistration = {
        robotId,
        handlers,
        subscriptions: [],
      };
      registrations.add(registration);

      if (client.connected) {
        subscribeRegistration(client, registration);
      }

      return () => {
        clearRegistration(registration);
        registrations.delete(registration);
      };
    },
  };
}

function subscribeRegistration(client: Client, registration: RobotTopicRegistration) {
  clearRegistration(registration);

  const { robotId, handlers } = registration;
  const subscriptions = [
    handlers.telemetry ? client.subscribe(stompTopics.telemetry(robotId), handlers.telemetry) : null,
    handlers.status ? client.subscribe(stompTopics.status(robotId), handlers.status) : null,
    handlers.events ? client.subscribe(stompTopics.events(robotId), handlers.events) : null,
    handlers.controlLock ? client.subscribe(stompTopics.controlLock(robotId), handlers.controlLock) : null,
    handlers.controlEvents ? client.subscribe(stompTopics.controlEvents(robotId), handlers.controlEvents) : null,
  ].filter((subscription): subscription is StompSubscription => subscription !== null);

  registration.subscriptions = subscriptions;
}

function clearRegistration(registration: RobotTopicRegistration) {
  registration.subscriptions.forEach((subscription) => subscription.unsubscribe());
  registration.subscriptions = [];
}
