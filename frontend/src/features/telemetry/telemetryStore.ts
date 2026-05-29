import { create } from 'zustand';
import { mockTelemetry } from './mockTelemetry';
import type { RealtimeConnectionState, Telemetry } from './types';

type ProtocolState = {
  https: 'connected' | 'disconnected';
  wss: RealtimeConnectionState;
  mqtt: 'connected' | 'degraded' | 'disconnected';
};

type TelemetryStore = {
  telemetryByRobotId: Record<string, Telemetry>;
  connectionState: RealtimeConnectionState;
  protocolState: ProtocolState;
  upsertTelemetry: (telemetry: Telemetry) => void;
  setConnectionState: (connectionState: RealtimeConnectionState) => void;
  setMqttState: (mqtt: ProtocolState['mqtt']) => void;
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  telemetryByRobotId: mockTelemetry,
  connectionState: 'mock',
  protocolState: {
    https: window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'connected' : 'disconnected',
    wss: 'mock',
    mqtt: 'connected',
  },
  upsertTelemetry: (telemetry) =>
    set((state) => ({
      telemetryByRobotId: {
        ...state.telemetryByRobotId,
        [telemetry.robotId]: telemetry,
      },
    })),
  setConnectionState: (connectionState) =>
    set((state) => ({
      connectionState,
      protocolState: {
        ...state.protocolState,
        wss: connectionState,
      },
    })),
  setMqttState: (mqtt) =>
    set((state) => ({
      protocolState: {
        ...state.protocolState,
        mqtt,
      },
    })),
}));
