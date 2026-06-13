import { httpClient } from '../../shared/api/httpClient';
import { env } from '../../shared/config/env';
import type { VideoSessionRequest, VideoSessionResponse, VideoStopRequest } from './types';

const mockDelayMs = 250;

export async function startStream(robotId: string, request: VideoSessionRequest): Promise<VideoSessionResponse> {
  if (shouldUseMockSignaling()) {
    await delay(mockDelayMs);

    return {
      sessionId: `mock-video-${robotId}-${Date.now()}`,
      robotId,
      whepUrl: null,
      state: 'connected',
      createdAt: new Date().toISOString(),
      mock: true,
    };
  }

  const response = await httpClient.post<Omit<VideoSessionResponse, 'mock'>>(
    `${signalingBasePath(robotId)}/offer`,
    request,
  );
  return { ...response, mock: false };
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

export async function reconnectStream(robotId: string, sessionId: string | null): Promise<VideoSessionResponse> {
  if (shouldUseMockSignaling()) {
    await delay(mockDelayMs);
    return {
      sessionId: `mock-video-${robotId}-${Date.now()}`,
      robotId,
      whepUrl: null,
      state: 'connected',
      createdAt: new Date().toISOString(),
      mock: true,
    };
  }

  const response = await httpClient.post<Omit<VideoSessionResponse, 'mock'>>(
    `${signalingBasePath(robotId)}/reconnect`,
    { robotId, sessionId },
  );
  return { ...response, mock: false };
}

function signalingBasePath(robotId: string) {
  if (env.webRtcSignalingUrl) {
    return `${env.webRtcSignalingUrl.replace(/\/$/, '')}/${robotId}`;
  }

  return `/api/video/${robotId}`;
}

function shouldUseMockSignaling() {
  return env.enableMockVideo;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
