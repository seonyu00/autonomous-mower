export type RobotMode = 'manual' | 'autonomous' | 'emergency' | 'idle';
export type WorkState = 'idle' | 'mowing' | 'paused' | 'error';
export type RealtimeConnectionState = 'mock' | 'connected' | 'connecting' | 'reconnecting' | 'degraded' | 'disconnected';

export type TelemetryReception = {
  state: 'never-seen' | 'normal' | 'delayed';
  lastReceivedAt: string | null;
  edgeSampledAt: string | null;
  checkedAt: string;
  recording?: { state: 'unknown' | 'available' | 'buffered'; possibleGap: boolean };
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
  errorObserved?: boolean;
  headingDegrees?: number | null;
  headingSource?: 'dual-gps' | null;
  headingObservedAt?: string | null;
  // 브라우저 수신 후 만료 판단에만 사용하는 값이며 서버로 보내지 않는다.
  headingExpiresAtMonotonic?: number;
};

export type RobotStatus = {
  robotId: string;
  connectionState: 'online' | 'degraded' | 'offline';
  mqttState: 'connected' | 'degraded' | 'disconnected';
  wssState: 'connected' | 'degraded' | 'disconnected';
  edgeState: string;
  manualLockReason?: string | null;
  autonomyReady?: boolean | null;
  autoMap?: unknown;
  lastSeenAt: string | null;
  telemetryReception?: TelemetryReception;
  stale: boolean;
};
