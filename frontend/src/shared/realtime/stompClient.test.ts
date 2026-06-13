import { beforeEach, describe, expect, it, vi } from 'vitest';

const stompMock = vi.hoisted(() => {
  const instances: FakeClient[] = [];

  class FakeClient {
    connected = false;
    config: Record<string, unknown>;
    subscriptions: Array<{ destination: string; unsubscribe: ReturnType<typeof vi.fn> }> = [];

    constructor(config: Record<string, unknown>) {
      this.config = config;
      instances.push(this);
    }

    activate = vi.fn();
    deactivate = vi.fn(async () => undefined);
    publish = vi.fn();
    subscribe = vi.fn((destination: string) => {
      const subscription = {
        destination,
        unsubscribe: vi.fn(),
      };
      this.subscriptions.push(subscription);
      return subscription;
    });
  }

  return { FakeClient, instances };
});

vi.mock('@stomp/stompjs', () => ({
  Client: stompMock.FakeClient,
  ReconnectionTimeMode: {
    EXPONENTIAL: 'EXPONENTIAL',
  },
}));

import { createStompClient } from './stompClient';

describe('createStompClient', () => {
  beforeEach(() => {
    stompMock.instances.length = 0;
  });

  it('sends the JWT in the STOMP CONNECT headers', () => {
    createStompClient({
      brokerURL: 'ws://localhost:8080/ws',
      enabled: true,
      accessToken: 'jwt-token',
      onStateChange: vi.fn(),
    });

    expect(stompMock.instances[0].config.connectHeaders).toEqual({
      Authorization: 'Bearer jwt-token',
    });
  });

  it('subscribes registered robot handlers after connect and restores them after reconnect', () => {
    const client = createStompClient({
      brokerURL: 'ws://localhost:8080/ws',
      enabled: true,
      accessToken: 'jwt-token',
      onStateChange: vi.fn(),
    });
    const unsubscribe = client.subscribeToRobotTopics('MOWER-01', {
      telemetry: vi.fn(),
      status: vi.fn(),
      events: vi.fn(),
      controlLock: vi.fn(),
      controlEvents: vi.fn(),
    });
    const instance = stompMock.instances[0];
    const onConnect = instance.config.onConnect as () => void;

    expect(instance.subscribe).not.toHaveBeenCalled();

    instance.connected = true;
    onConnect();

    expect(instance.subscribe.mock.calls.map(([destination]) => destination)).toEqual([
      '/topic/robots/MOWER-01/telemetry',
      '/topic/robots/MOWER-01/status',
      '/topic/robots/MOWER-01/events',
      '/topic/robots/MOWER-01/control-lock',
      '/topic/robots/MOWER-01/control-events',
    ]);

    const firstSubscriptions = [...instance.subscriptions];
    onConnect();

    firstSubscriptions.forEach((subscription) => {
      expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    });
    expect(instance.subscribe).toHaveBeenCalledTimes(10);

    unsubscribe();

    instance.subscriptions.slice(5).forEach((subscription) => {
      expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    });
  });
});
