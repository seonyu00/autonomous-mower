import { httpClient } from '../../shared/api/httpClient';
import { env } from '../../shared/config/env';
import type { VideoSignalAnswer, VideoSignalOfferRequest, VideoStopRequest } from './types';

const mockDelayMs = 250;

export async function startStream(robotId: string, offer: VideoSignalOfferRequest): Promise<VideoSignalAnswer> {
  if (shouldUseMockSignaling()) {
    await delay(mockDelayMs);

    return {
      sessionId: `mock-video-${robotId}-${Date.now()}`,
      sdp: null,
      type: 'mock-answer',
      iceServers: [],
      mock: true,
    };
  }

  return httpClient.post<VideoSignalAnswer>(`${signalingBasePath(robotId)}/offer`, offer);
}

export async function stopStream(robotId: string, sessionId: string | null): Promise<void> {
  const request: VideoStopRequest = {
    robotId,
    sessionId,
  };

  if (shouldUseMockSignaling()) {
    await delay(120);
    return;
  }

  await httpClient.post<void>(`${signalingBasePath(robotId)}/stop`, request);
}

export async function reconnectStream(robotId: string, sessionId: string | null): Promise<void> {
  if (shouldUseMockSignaling()) {
    await delay(mockDelayMs);
    return;
  }

  await httpClient.post<void>(`${signalingBasePath(robotId)}/reconnect`, { robotId, sessionId });
}

function signalingBasePath(robotId: string) {
  if (env.webRtcSignalingUrl) {
    return `${env.webRtcSignalingUrl.replace(/\/$/, '')}/${robotId}`;
  }

  return `/api/video/${robotId}`;
}

function shouldUseMockSignaling() {
  return import.meta.env.DEV || env.enableMockRealtime || !env.webRtcSignalingUrl;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
