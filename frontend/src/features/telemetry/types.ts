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
  latitude: number | null;
  longitude: number | null;
  batteryLevel: number | null;
  mode: RobotMode | null;
  workState: WorkState | null;
  speedMps: number | null;
  signalStrength: number | null;
  lastReceivedAt: string;
  edgeSampledAt?: string | null;
  serverTimestamp?: string;
  errorState?: string | null;
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
