import { reconnectStream, startStream as startSignaling, stopStream as stopSignaling } from './signalingApi';
import { useAuthStore } from '../auth/authStore';
import { useVideoStore } from './videoStore';
import { WhepClient } from './WhepClient';
import type { VideoSession, VideoSessionResponse } from './types';

type WebRtcClientOptions = {
  onRemoteStream?: (stream: MediaStream | null) => void;
};

export class WebRTCClient {
  private readonly authSessionVersion = useAuthStore.getState().sessionVersion;
  private readonly whepClient: WhepClient;
  private robotId: string | null = null;
  private sessionId: string | null = null;
  private readonly onRemoteStream?: (stream: MediaStream | null) => void;

  constructor(options: WebRtcClientOptions = {}) {
    this.onRemoteStream = options.onRemoteStream;
    this.whepClient = new WhepClient({
      onRemoteStream: (stream) => {
        if (!this.isCurrentSession()) return;
        this.onRemoteStream?.(stream);
        if (this.robotId) {
          this.patchSession(this.robotId, {
            stream,
            connectionState: 'connected',
            loading: false,
          });
        }
      },
      onConnectionStateChange: (state) => {
        if (this.robotId) {
          this.patchSession(this.robotId, {
            connectionState: mapPeerConnectionState(state),
            loading: state === 'connecting' || state === 'new',
          });
        }
      },
    });
  }

  async startStream(robotId: string) {
    if (!this.isCurrentSession()) return;
    this.robotId = robotId;
    this.patchSession(robotId, {
      connectionState: 'connecting',
      loading: true,
      error: null,
      lastStartedAt: new Date().toISOString(),
    });

    try {
      const quality = useVideoStore.getState().getSession(robotId).qualityPolicy;
      const session = await startSignaling(robotId, {
        robotId,
        width: quality.width,
        height: quality.height,
        fps: quality.minFps,
        maxBitrateKbps: quality.maxBitrateKbps,
      });
      await this.connectSession(session);
    } catch (error) {
      await this.whepClient.close();
      this.patchFailure(robotId, error, '영상 스트림을 시작하지 못했습니다.');
    }
  }

  async stopStream(robotId = this.robotId) {
    if (!robotId) {
      return;
    }

    const sessionId = this.sessionId ?? useVideoStore.getState().getSession(robotId).sessionId;
    await this.whepClient.close();
    this.onRemoteStream?.(null);

    try {
      if (!this.isCurrentSession()) return;
      await stopSignaling(robotId, sessionId);
      this.patchSession(robotId, {
        sessionId: null,
        stream: null,
        connectionState: 'disconnected',
        loading: false,
        error: null,
        lastStoppedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.patchFailure(robotId, error, '영상 스트림을 중지하지 못했습니다.');
    } finally {
      this.robotId = null;
      this.sessionId = null;
    }
  }

  async reconnect(robotId = this.robotId) {
    if (!this.isCurrentSession()) return;
    if (!robotId) {
      return;
    }

    this.patchSession(robotId, {
      connectionState: 'reconnecting',
      loading: true,
      error: null,
    });

    try {
      await this.whepClient.close();
      if (!this.isCurrentSession()) return;
      const session = await reconnectStream(robotId, this.sessionId);
      this.robotId = robotId;
      await this.connectSession(session);
    } catch (error) {
      this.patchFailure(robotId, error, '영상 스트림을 다시 연결하지 못했습니다.');
    }
  }

  private async connectSession(session: VideoSessionResponse) {
    if (!this.isCurrentSession()) return;
    this.sessionId = session.sessionId;

    if (!session.mock) {
      if (!session.whepUrl) {
        throw new Error('WHEP 연결 주소가 없습니다.');
      }
      await this.whepClient.connect(session.whepUrl);
      if (!this.isCurrentSession()) {
        await this.whepClient.close();
        return;
      }
    }

    this.patchSession(session.robotId, {
      sessionId: session.sessionId,
      connectionState: 'connected',
      loading: false,
      error: null,
      mock: session.mock,
    });
  }

  private isCurrentSession() {
    return useAuthStore.getState().sessionVersion === this.authSessionVersion;
  }

  private patchSession(robotId: string, patch: Partial<VideoSession>) {
    if (this.isCurrentSession()) useVideoStore.getState().patchSession(robotId, patch);
  }

  private patchFailure(robotId: string, error: unknown, fallback: string) {
    this.patchSession(robotId, {
      connectionState: 'failed',
      loading: false,
      error: error instanceof Error ? error.message : fallback,
    });
  }
}

function mapPeerConnectionState(state: RTCPeerConnectionState) {
  if (state === 'connected') {
    return 'connected';
  }
  if (state === 'connecting' || state === 'new') {
    return 'connecting';
  }
  if (state === 'disconnected' || state === 'closed') {
    return 'disconnected';
  }
  return 'failed';
}
