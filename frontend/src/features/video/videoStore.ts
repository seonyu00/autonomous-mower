import { create } from 'zustand';
import type { VideoQualityPolicy, VideoSession, VideoSnapshotPlaceholder } from './types';

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
  requestSnapshot: (robotId: string, at?: string) => VideoSnapshotPlaceholder;
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
    qualityPolicy: defaultVideoQualityPolicy,
    snapshot: null,
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
  requestSnapshot: (robotId, at = new Date().toISOString()) => {
    const snapshot: VideoSnapshotPlaceholder = {
      id: `snapshot-placeholder-${robotId}-${Date.parse(at)}`,
      robotId,
      capturedAt: at,
      contentType: 'image/jpeg',
      status: 'requested',
    };

    get().patchSession(robotId, { snapshot });

    return snapshot;
  },
  resetSession: (robotId) =>
    set((state) => ({
      sessionsByRobotId: {
        ...state.sessionsByRobotId,
        [robotId]: createDefaultVideoSession(robotId),
      },
    })),
}));
