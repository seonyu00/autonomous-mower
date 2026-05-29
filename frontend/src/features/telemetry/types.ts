export type RobotMode = 'manual' | 'autonomous' | 'emergency' | 'idle';
export type WorkState = 'idle' | 'mowing' | 'paused' | 'error';
export type RealtimeConnectionState = 'mock' | 'connected' | 'connecting' | 'reconnecting' | 'degraded' | 'disconnected';

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
  errorState?: string;
};
