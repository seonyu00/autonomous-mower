import { reconnectStream, startStream as startSignaling, stopStream as stopSignaling } from './signalingApi';
import { useAuthStore } from '../auth/authStore';
import { useVideoStore } from './videoStore';
import { WhepClient } from './WhepClient';
import { videoOperation } from './videoOperation';
import type { VideoSession } from './types';

type WebRtcClientOptions = {
  onRemoteStream?: (stream: MediaStream | null) => void;
};

type Attempt = {
  robotId: string;
  sessionId: string | null;
  previousSessionId: string | null;
  controller: AbortController;
  whep: WhepClient;
};

export class WebRTCClient {
  private readonly authSessionVersion = useAuthStore.getState().sessionVersion;
  private attempt: Attempt | null = null;

  constructor(private readonly options: WebRtcClientOptions = {}) {}

  startStream(robotId: string) {
    return this.connect(robotId, false);
  }

  reconnect(robotId = this.attempt?.robotId) {
    return robotId ? this.connect(robotId, true) : Promise.resolve();
  }

  async stopStream(robotId = this.attempt?.robotId) {
    const attempt = this.attempt;
    if (!attempt || attempt.robotId !== robotId) return;
    this.release(attempt);
  }

  private async connect(robotId: string, reconnect: boolean) {
    if (!this.isCurrentSession()) return;
    const previousSessionId = this.attempt?.robotId === robotId ? this.attempt.sessionId : null;
    if (this.attempt) this.release(this.attempt, !reconnect || !previousSessionId);
    const controller = new AbortController();
    const attempt: Attempt = {
      robotId, sessionId: null, previousSessionId: reconnect ? previousSessionId : null, controller,
      whep: new WhepClient({
        onRemoteStream: (stream) => {
          if (!this.isCurrent(attempt)) return;
          this.patchSession(robotId, { stream });
          this.options.onRemoteStream?.(stream);
        },
        onConnectionStateChange: (state) => {
          if (!this.isCurrent(attempt)) return;
          if (['failed', 'closed', 'disconnected'].includes(state)) {
            this.release(attempt);
            this.patchSession(robotId, { connectionState: state === 'failed' ? 'failed' : 'disconnected',
              error: state === 'failed' ? 'WebRTC 연결에 실패했습니다.' : null });
          } else {
            this.patchSession(robotId, { connectionState: state === 'connected' ? 'connected' : 'connecting',
              loading: state !== 'connected' });
          }
        },
      }),
    };
    this.attempt = attempt;
    this.patchSession(robotId, { connectionState: reconnect ? 'reconnecting' : 'connecting', loading: true,
      stream: null, lastFrameAt: null, frameReceiving: false, sessionId: null, error: null, lastStartedAt: new Date().toISOString() });
    try {
      const session = await videoOperation(async (signal) => {
        const quality = useVideoStore.getState().getSession(robotId).qualityPolicy;
        const result = reconnect && previousSessionId
          ? await reconnectStream(robotId, previousSessionId, signal)
          : await startSignaling(robotId, { robotId, width: quality.width, height: quality.height,
            fps: quality.minFps, maxBitrateKbps: quality.maxBitrateKbps }, signal);
        if (signal.aborted || !this.isCurrent(attempt)) {
          this.stopBackend(result.robotId, result.sessionId);
          throw signal.reason ?? new DOMException('연결이 취소되었습니다.', 'AbortError');
        }
        return result;
      }, controller.signal);
      if (!this.isCurrent(attempt)) { this.stopBackend(session.robotId, session.sessionId); return; }
      attempt.previousSessionId = null;
      attempt.sessionId = session.sessionId;
      if (session.robotId !== robotId) throw new Error('요청한 로봇과 영상 세션이 일치하지 않습니다.');
      this.patchSession(robotId, { sessionId: session.sessionId, mock: session.mock });
      if (!session.mock) {
        if (!session.whepUrl) throw new Error('WHEP 연결 주소가 없습니다.');
        await attempt.whep.connect(session.whepUrl);
      }
      if (!this.isCurrent(attempt)) {
        if (this.attempt === attempt) this.release(attempt);
        return;
      }
      this.patchSession(robotId, { connectionState: 'connected', loading: false, error: null });
    } catch (error) {
      // 오래된 시도의 실패가 새 연결을 종료하거나 상태를 덮지 않게 한다.
      if (!this.isCurrent(attempt)) {
        if (this.attempt === attempt) this.release(attempt);
        return;
      }
      this.release(attempt);
      this.patchSession(robotId, { connectionState: 'failed', loading: false,
        error: error instanceof Error ? error.message : '영상 스트림을 연결하지 못했습니다.' });
    }
  }

  private release(attempt: Attempt, stopBackend = true) {
    if (this.attempt === attempt) this.attempt = null;
    attempt.controller.abort();
    attempt.whep.close();
    this.options.onRemoteStream?.(null);
    this.patchSession(attempt.robotId, { sessionId: null, stream: null, connectionState: 'disconnected',
      loading: false, error: null, lastFrameAt: null, frameReceiving: false, lastStoppedAt: new Date().toISOString() });
    if (stopBackend && attempt.sessionId) this.stopBackend(attempt.robotId, attempt.sessionId);
    if (attempt.previousSessionId) this.stopBackend(attempt.robotId, attempt.previousSessionId);
    attempt.sessionId = null;
    attempt.previousSessionId = null;
  }

  private stopBackend(robotId: string, sessionId: string) {
    if (!this.isCurrentSession()) return;
    void videoOperation((signal) => this.isCurrentSession()
      ? stopSignaling(robotId, sessionId, signal) : Promise.resolve()).catch(() => undefined);
  }

  private isCurrent(attempt: Attempt) {
    return this.attempt === attempt && !attempt.controller.signal.aborted && this.isCurrentSession();
  }

  private isCurrentSession() {
    return useAuthStore.getState().sessionVersion === this.authSessionVersion;
  }

  private patchSession(robotId: string, patch: Partial<VideoSession>) {
    if (this.isCurrentSession()) useVideoStore.getState().patchSession(robotId, patch);
  }
}
