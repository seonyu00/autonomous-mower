export type RobotMode = 'manual' | 'autonomous' | 'emergency' | 'idle';
export type WorkState = 'idle' | 'mowing' | 'paused' | 'error';
export type RealtimeConnectionState = 'mock' | 'connected' | 'connecting' | 'reconnecting' | 'degraded' | 'disconnected';

export type TelemetryReception = {
  state: 'never-seen' | 'normal' | 'delayed';
  lastReceivedAt: string | null;
  edgeSampledAt: string | null;
  checkedAt: string;
};

export type Telemetry = {
  robotId: string;
  latitude: number;
  longitude: number;
  batteryLevel: number;
  mode: RobotMode;
  workState: WorkState;
  speedMps: number;
  signalStrength: number;
  lastReceivedAt: string;
  edgeSampledAt?: string | null;
  serverTimestamp?: string;
  errorState?: string;
};

export type RobotStatus = {
  robotId: string;
  connectionState: 'online' | 'degraded' | 'offline';
  mqttState: 'connected' | 'degraded' | 'disconnected';
  wssState: 'connected' | 'degraded' | 'disconnected';
  edgeState: string;
  lastSeenAt: string | null;
  telemetryReception?: TelemetryReception;
  stale: boolean;
};
