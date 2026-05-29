import type { Telemetry } from '../../features/telemetry/types';

export type TopicMessage =
  | {
      type: 'telemetry';
      payload: Telemetry;
    }
  | {
      type: 'unknown';
      payload: unknown;
    };

export function parseTopicMessage(topic: string, rawPayload: string): TopicMessage {
  const payload = JSON.parse(rawPayload) as unknown;

  if (topic.includes('/telemetry')) {
    return {
      type: 'telemetry',
      payload: payload as Telemetry,
    };
  }

  return {
    type: 'unknown',
    payload,
  };
}
