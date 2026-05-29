import { create } from 'zustand';
import type { VideoSession } from './types';

type VideoStore = {
  sessionsByRobotId: Record<string, VideoSession>;
  getSession: (robotId: string) => VideoSession;
  patchSession: (robotId: string, patch: Partial<VideoSession>) => void;
  resetSession: (robotId: string) => void;
};

export function createDefaultVideoSession(robotId: string): VideoSession {
  return {
    robotId,
    sessionId: null,
    connectionState: 'idle',
    stream: null,
    error: null,
    loading: false,
    lastStartedAt: null,
    lastStoppedAt: null,
    mock: true,
  };
}

export const useVideoStore = create<VideoStore>((set, get) => ({
  sessionsByRobotId: {},
  getSession: (robotId) => get().sessionsByRobotId[robotId] ?? createDefaultVideoSession(robotId),
  patchSession: (robotId, patch) =>
    set((state) => {
      const current = state.sessionsByRobotId[robotId] ?? createDefaultVideoSession(robotId);

      return {
        sessionsByRobotId: {
          ...state.sessionsByRobotId,
          [robotId]: {
            ...current,
            ...patch,
          },
        },
      };
    }),
  resetSession: (robotId) =>
    set((state) => ({
      sessionsByRobotId: {
        ...state.sessionsByRobotId,
        [robotId]: createDefaultVideoSession(robotId),
      },
    })),
}));
