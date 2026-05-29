import type { SnapshotRef } from '../logs/types';

export type VideoConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';

export type VideoQualityPolicy = {
  minFps: number;
  width: number;
  height: number;
  maxBitrateKbps: number;
};

export type VideoSnapshotPlaceholder = SnapshotRef & {
  robotId: string;
  status: 'placeholder' | 'requested';
};

export type VideoSession = {
  robotId: string;
  sessionId: string | null;
  connectionState: VideoConnectionState;
  stream: MediaStream | null;
  error: string | null;
  loading: boolean;
  qualityPolicy: VideoQualityPolicy;
  snapshot: VideoSnapshotPlaceholder | null;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  mock: boolean;
};

export type VideoSignalOfferRequest = {
  robotId: string;
  sdp: string | null;
  type: RTCSdpType | 'mock-offer';
};

export type VideoSignalAnswer = {
  sessionId: string;
  sdp: string | null;
  type: RTCSdpType | 'mock-answer';
  iceServers?: RTCIceServer[];
  mock: boolean;
};

export type VideoStopRequest = {
  robotId: string;
  sessionId: string | null;
};
