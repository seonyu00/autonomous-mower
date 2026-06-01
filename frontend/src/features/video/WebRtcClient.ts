import { reconnectStream, startStream as startSignaling, stopStream as stopSignaling } from './signalingApi';
import { useVideoStore } from './videoStore';
import type { VideoSignalOfferRequest } from './types';

type WebRtcClientOptions = {
  onRemoteStream?: (stream: MediaStream | null) => void;
  connectionTimeoutMs?: number;
};

export class WebRTCClient {
  private peerConnection: RTCPeerConnection | null = null;
  private robotId: string | null = null;
  private sessionId: string | null = null;
  private connectionTimeoutId: number | undefined;
  private readonly onRemoteStream?: (stream: MediaStream | null) => void;
  private readonly connectionTimeoutMs: number;

  constructor(options: WebRtcClientOptions = {}) {
    this.onRemoteStream = options.onRemoteStream;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 8000;
  }

  async startStream(robotId: string) {
    this.clearConnectionTimeout();
    this.robotId = robotId;
    useVideoStore.getState().patchSession(robotId, {
      connectionState: 'connecting',
      loading: true,
      error: null,
      lastStartedAt: new Date().toISOString(),
    });

    try {
      this.peerConnection = this.createPeerConnection(robotId);
      this.startConnectionTimeout(robotId);
      const offer = await this.createOffer(robotId);
      const answer = await startSignaling(robotId, offer);
      this.sessionId = answer.sessionId;

      if (this.peerConnection && answer.sdp && answer.type !== 'mock-answer') {
        await this.peerConnection.setRemoteDescription({
          type: answer.type,
          sdp: answer.sdp,
        });
      }

      useVideoStore.getState().patchSession(robotId, {
        sessionId: answer.sessionId,
        connectionState: 'connected',
        loading: false,
        error: null,
        mock: answer.mock,
      });
      this.clearConnectionTimeout();
    } catch (error) {
      this.closePeerConnection();
      useVideoStore.getState().patchSession(robotId, {
        connectionState: 'failed',
        loading: false,
        error: error instanceof Error ? error.message : '영상 스트림을 시작하지 못했습니다.',
      });
    }
  }

  async stopStream(robotId = this.robotId) {
    if (!robotId) {
      return;
    }

    const sessionId = this.sessionId ?? useVideoStore.getState().getSession(robotId).sessionId;
    this.closePeerConnection();
    this.onRemoteStream?.(null);

    try {
      await stopSignaling(robotId, sessionId);
      useVideoStore.getState().patchSession(robotId, {
        sessionId: null,
        stream: null,
        connectionState: 'disconnected',
        loading: false,
        error: null,
        lastStoppedAt: new Date().toISOString(),
      });
    } catch (error) {
      useVideoStore.getState().patchSession(robotId, {
        connectionState: 'failed',
        loading: false,
        error: error instanceof Error ? error.message : '영상 스트림을 중지하지 못했습니다.',
      });
    } finally {
      this.robotId = null;
      this.sessionId = null;
    }
  }

  async reconnect(robotId = this.robotId) {
    if (!robotId) {
      return;
    }

    useVideoStore.getState().patchSession(robotId, {
      connectionState: 'reconnecting',
      loading: true,
      error: null,
    });

    try {
      await reconnectStream(robotId, this.sessionId);
      await this.stopStream(robotId);
      await this.startStream(robotId);
    } catch (error) {
      useVideoStore.getState().patchSession(robotId, {
        connectionState: 'failed',
        loading: false,
        error: error instanceof Error ? error.message : '영상 스트림을 다시 연결하지 못했습니다.',
      });
    }
  }

  private createPeerConnection(robotId: string) {
    if (!('RTCPeerConnection' in window)) {
      return null;
    }

    const peerConnection = new RTCPeerConnection();
    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;

      if (!stream) {
        return;
      }

      this.onRemoteStream?.(stream);
      useVideoStore.getState().patchSession(robotId, {
        stream,
        connectionState: 'connected',
        loading: false,
      });
    };
    peerConnection.onconnectionstatechange = () => {
      const state = mapPeerConnectionState(peerConnection.connectionState);
      if (state === 'connected' || state === 'failed' || state === 'disconnected') {
        this.clearConnectionTimeout();
      }
      useVideoStore.getState().patchSession(robotId, {
        connectionState: state,
        loading: state === 'connecting',
      });
    };
    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'failed') {
        this.failConnection(robotId, 'WebRTC ICE 연결을 맺지 못했습니다.');
      }

      if (peerConnection.iceConnectionState === 'disconnected') {
        useVideoStore.getState().patchSession(robotId, {
          connectionState: 'disconnected',
          loading: false,
          error: 'WebRTC ICE connection disconnected.',
        });
      }
    };

    return peerConnection;
  }

  private async createOffer(robotId: string): Promise<VideoSignalOfferRequest> {
    if (!this.peerConnection) {
      return {
        robotId,
        sdp: null,
        type: 'mock-offer',
      };
    }

    const offer = await this.peerConnection.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: false,
    });
    await this.peerConnection.setLocalDescription(offer);

    return {
      robotId,
      sdp: offer.sdp ?? null,
      type: offer.type,
    };
  }

  private closePeerConnection() {
    this.clearConnectionTimeout();
    this.peerConnection?.getSenders().forEach((sender) => {
      sender.track?.stop();
    });
    this.peerConnection?.close();
    this.peerConnection = null;
  }

  private startConnectionTimeout(robotId: string) {
    this.connectionTimeoutId = window.setTimeout(() => {
      const session = useVideoStore.getState().getSession(robotId);

      if (session.connectionState === 'connecting' || session.connectionState === 'reconnecting') {
        this.failConnection(robotId, 'WebRTC connection timed out.');
      }
    }, this.connectionTimeoutMs);
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeoutId !== undefined) {
      window.clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = undefined;
    }
  }

  private failConnection(robotId: string, error: string) {
    this.closePeerConnection();
    useVideoStore.getState().patchSession(robotId, {
      connectionState: 'failed',
      loading: false,
      error,
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

  if (state === 'disconnected') {
    return 'disconnected';
  }

  return 'failed';
}
