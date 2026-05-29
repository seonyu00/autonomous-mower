import { create } from 'zustand';
import type { ControlMode, ControlState, PendingCommand } from './types';

type ControlStore = {
  controlByRobotId: Record<string, ControlState>;
  getControlState: (robotId: string) => ControlState;
  patchControlState: (robotId: string, patch: Partial<ControlState>) => void;
  setControlOwner: (robotId: string, owner: string | null) => void;
  setMode: (robotId: string, mode: ControlMode) => void;
  setPendingCommand: (robotId: string, pendingCommand: PendingCommand | null) => void;
  setCommandError: (robotId: string, commandError: string | null) => void;
  recordManualInput: (robotId: string, at?: string) => void;
};

export function createDefaultControlState(robotId: string): ControlState {
  return {
    robotId,
    lockState: 'none',
    mode: 'idle',
    emergency: false,
    manualActive: false,
    lastInputAt: null,
    pendingCommand: null,
    commandError: null,
    controlOwner: null,
    lastCommandPayload: null,
  };
}

export const useControlStore = create<ControlStore>((set, get) => ({
  controlByRobotId: {},
  getControlState: (robotId): ControlState => get().controlByRobotId[robotId] ?? createDefaultControlState(robotId),
  patchControlState: (robotId, patch) =>
    set((state) => {
      const current = state.controlByRobotId[robotId] ?? createDefaultControlState(robotId);

      return {
        controlByRobotId: {
          ...state.controlByRobotId,
          [robotId]: {
            ...current,
            ...patch,
          },
        },
      };
    }),
  setControlOwner: (robotId, owner) =>
    get().patchControlState(robotId, {
      controlOwner: owner,
      lockState: owner ? 'held' : 'none',
    }),
  setMode: (robotId, mode) => get().patchControlState(robotId, { mode }),
  setPendingCommand: (robotId, pendingCommand) => get().patchControlState(robotId, { pendingCommand }),
  setCommandError: (robotId, commandError) => get().patchControlState(robotId, { commandError }),
  recordManualInput: (robotId, at = new Date().toISOString()) =>
    get().patchControlState(robotId, {
      lastInputAt: at,
      manualActive: true,
    }),
}));
