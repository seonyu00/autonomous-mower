import { create } from 'zustand';
import type { RealtimeConnectionState, RobotStatus, Telemetry, TelemetryReception } from './types';

type ProtocolState = {
  https: 'connected' | 'disconnected';
  wss: RealtimeConnectionState;
  mqtt: 'connected' | 'degraded' | 'disconnected';
};

type TelemetryStore = {
  receptionByRobotId: Record<string, TelemetryReception & { observedAt: number }>;
  upsertReception: (robotId: string, reception: TelemetryReception) => void;
  dataSource: 'real' | 'mock';
  telemetryByRobotId: Record<string, Telemetry>;
  statusByRobotId: Record<string, RobotStatus>;
  connectionState: RealtimeConnectionState;
  protocolState: ProtocolState;
  upsertTelemetry: (telemetry: Telemetry) => void;
  upsertStatus: (status: RobotStatus) => void;
  setConnectionState: (connectionState: RealtimeConnectionState) => void;
  setMqttState: (mqtt: ProtocolState['mqtt']) => void;
};

export const useTelemetryStore = create<TelemetryStore>((set, get) => ({
  receptionByRobotId: {},
  upsertReception: (robotId, reception) => set((state) => {
    const previous = state.receptionByRobotId[robotId];
    if (previous && Date.parse(previous.checkedAt) >= Date.parse(reception.checkedAt)) return state;
    return { receptionByRobotId: { ...state.receptionByRobotId, [robotId]: { ...reception, observedAt: Date.now() } } };
  }),
  dataSource: 'real',
  telemetryByRobotId: {},
  statusByRobotId: {},
  connectionState: 'disconnected',
  protocolState: {
    https: window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'connected' : 'disconnected',
    wss: 'disconnected',
    mqtt: 'disconnected',
  },
  upsertTelemetry: (telemetry) => {
    get().upsertReception(telemetry.robotId, {
      state: 'normal',
      lastReceivedAt: telemetry.lastReceivedAt,
      edgeSampledAt: telemetry.edgeSampledAt ?? null,
      checkedAt: telemetry.serverTimestamp ?? telemetry.lastReceivedAt,
    });
    set((state) => ({
      dataSource: 'real',
      telemetryByRobotId: {
        ...state.telemetryByRobotId,
        [telemetry.robotId]: telemetry,
      },
    }));
  },
  upsertStatus: (status) => {
    if (status.telemetryReception) get().upsertReception(status.robotId, status.telemetryReception);
    set((state) => ({
      statusByRobotId: {
        ...state.statusByRobotId,
        [status.robotId]: status,
      },
      protocolState: {
        ...state.protocolState,
        mqtt: status.mqttState,
      },
    }));
  },
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
