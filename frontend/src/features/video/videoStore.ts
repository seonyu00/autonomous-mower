import { create } from 'zustand';
import type { VideoQualityPolicy, VideoSession, VideoSnapshot } from './types';

export const defaultVideoQualityPolicy: VideoQualityPolicy = {
  minFps: 15,
  width: 640,
  height: 480,
  maxBitrateKbps: 500,
};

type VideoStore = {
  sessionsByRobotId: Record<string, VideoSession>;
  getSession: (robotId: string) => VideoSession;
  patchSession: (robotId: string, patch: Partial<VideoSession>) => void;
  setSnapshot: (robotId: string, snapshot: VideoSnapshot) => void;
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
    qualityPolicy: { ...defaultVideoQualityPolicy },
    snapshot: null,
    snapshotLoading: false,
    snapshotError: null,
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
  setSnapshot: (robotId, snapshot) => {
    get().patchSession(robotId, { snapshot });
  },
  resetSession: (robotId) =>
    set((state) => ({
      sessionsByRobotId: {
        ...state.sessionsByRobotId,
        [robotId]: createDefaultVideoSession(robotId),
      },
    })),
}));
