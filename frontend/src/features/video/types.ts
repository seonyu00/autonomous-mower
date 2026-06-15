import type { SnapshotRef } from '../logs/types';

export type VideoConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';

export type VideoQualityPolicy = {
  minFps: number;
  width: number;
  height: number;
  maxBitrateKbps: number;
};

export type VideoSnapshot = SnapshotRef & {
  robotId: string;
  status: 'saved';
};

export type VideoSession = {
  robotId: string;
  sessionId: string | null;
  connectionState: VideoConnectionState;
  stream: MediaStream | null;
  error: string | null;
  loading: boolean;
  qualityPolicy: VideoQualityPolicy;
  snapshot: VideoSnapshot | null;
  snapshotLoading: boolean;
  snapshotError: string | null;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  mock: boolean;
};

export type VideoSessionRequest = {
  robotId: string;
  width: number;
  height: number;
  fps: number;
  maxBitrateKbps: number;
};

export type VideoSessionResponse = {
  sessionId: string;
  robotId: string;
  whepUrl: string | null;
  state: string;
  createdAt: string;
  mock: boolean;
};

export type VideoStopRequest = {
  robotId: string;
  sessionId: string | null;
};
