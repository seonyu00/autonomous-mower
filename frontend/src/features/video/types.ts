export type VideoConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';

export type VideoSession = {
  robotId: string;
  sessionId: string | null;
  connectionState: VideoConnectionState;
  stream: MediaStream | null;
  error: string | null;
  loading: boolean;
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
