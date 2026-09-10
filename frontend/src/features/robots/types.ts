import type { TelemetryReception } from '../telemetry/types';

export type RobotConnectionState = 'online' | 'degraded' | 'offline';

export type Robot = {
  id: string;
  modelName: string;
  connectionState: RobotConnectionState;
  active: boolean;
  telemetryReception?: TelemetryReception;
};
