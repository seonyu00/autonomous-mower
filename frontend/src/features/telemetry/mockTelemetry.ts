import type { Telemetry } from './types';

export const mockTelemetry: Record<string, Telemetry> = {
  'MOWER-01': {
    robotId: 'MOWER-01',
    latitude: 36.6285,
    longitude: 127.4564,
    batteryLevel: 82,
    mode: 'autonomous',
    workState: 'mowing',
    speedMps: 0.8,
    signalStrength: 92,
    lastReceivedAt: new Date().toISOString(),
  },
  'MOWER-02': {
    robotId: 'MOWER-02',
    latitude: 36.6279,
    longitude: 127.4558,
    batteryLevel: 47,
    mode: 'idle',
    workState: 'paused',
    speedMps: 0,
    signalStrength: 58,
    lastReceivedAt: new Date(Date.now() - 4000).toISOString(),
    errorState: '텔레메트리(Telemetry) 지연',
  },
  'MOWER-03': {
    robotId: 'MOWER-03',
    latitude: 36.6291,
    longitude: 127.4572,
    batteryLevel: 15,
    mode: 'emergency',
    workState: 'error',
    speedMps: 0,
    signalStrength: 0,
    lastReceivedAt: new Date(Date.now() - 12000).toISOString(),
    errorState: '통신 끊김',
  },
};
