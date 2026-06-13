import { create } from 'zustand';
import { mockTelemetry } from './mockTelemetry';
import type { RealtimeConnectionState, RobotStatus, Telemetry } from './types';

type ProtocolState = {
  https: 'connected' | 'disconnected';
  wss: RealtimeConnectionState;
  mqtt: 'connected' | 'degraded' | 'disconnected';
};

type TelemetryStore = {
  telemetryByRobotId: Record<string, Telemetry>;
  statusByRobotId: Record<string, RobotStatus>;
  connectionState: RealtimeConnectionState;
  protocolState: ProtocolState;
  upsertTelemetry: (telemetry: Telemetry) => void;
  upsertStatus: (status: RobotStatus) => void;
  setConnectionState: (connectionState: RealtimeConnectionState) => void;
  setMqttState: (mqtt: ProtocolState['mqtt']) => void;
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  telemetryByRobotId: mockTelemetry,
  statusByRobotId: {},
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
  upsertStatus: (status) =>
    set((state) => ({
      statusByRobotId: {
        ...state.statusByRobotId,
        [status.robotId]: status,
      },
      protocolState: {
        ...state.protocolState,
        mqtt: status.mqttState,
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
