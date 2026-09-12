import { videoOperation } from './videoOperation';

type WhepClientOptions = {
  createPeerConnection?: () => RTCPeerConnection;
  fetchFn?: typeof fetch;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
};

type Connection = {
  peer: RTCPeerConnection;
  controller: AbortController;
  sessionUrl: string | null;
  streams: Set<MediaStream>;
};

export class WhepClient {
  private connection: Connection | null = null;
  private readonly createPeerConnection: () => RTCPeerConnection;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: WhepClientOptions = {}) {
    this.createPeerConnection = options.createPeerConnection ?? (() => new RTCPeerConnection());
    this.fetchFn = (options.fetchFn ?? fetch).bind(globalThis);
  }

  async connect(whepUrl: string) {
    this.close();
    const peer = this.createPeerConnection();
    const connection: Connection = { peer, controller: new AbortController(), sessionUrl: null, streams: new Set() };
    this.connection = connection;
    const isCurrent = () => this.connection === connection && !connection.controller.signal.aborted;
    peer.ontrack = (event) => {
      if (!isCurrent()) return;
      const [stream] = event.streams;
      if (stream) {
        connection.streams.add(stream);
        this.options.onRemoteStream?.(stream);
      }
    };
    peer.onconnectionstatechange = () => {
      if (isCurrent()) this.options.onConnectionStateChange?.(peer.connectionState);
    };

    try {
      await videoOperation(async (signal) => {
        peer.addTransceiver('video', { direction: 'recvonly' });
        const offer = await peer.createOffer();
        signal.throwIfAborted();
        await peer.setLocalDescription(offer);
        await waitForState(peer, 'icegatheringstatechange', () => peer.iceGatheringState === 'complete', signal);
        const localSdp = peer.localDescription?.sdp;
        if (!localSdp) throw new Error('WebRTC SDP offer를 생성하지 못했습니다.');
        const response = await this.fetchFn(whepUrl, {
          method: 'POST', signal,
          headers: { Accept: 'application/sdp', 'Content-Type': 'application/sdp' }, body: localSdp,
        });
        const location = response.headers.get('Location');
        const sessionUrl = location ? new URL(location, whepUrl).toString() : null;
        if (signal.aborted || !isCurrent()) {
          if (sessionUrl) this.deleteSession(sessionUrl);
          throw signal.reason ?? new DOMException('연결이 취소되었습니다.', 'AbortError');
        }
        connection.sessionUrl = sessionUrl;
        if (!response.ok) throw new Error(`WHEP 연결에 실패했습니다. (${response.status})`);
        const answerSdp = await response.text();
        signal.throwIfAborted();
        await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
        await waitForState(peer, 'connectionstatechange', () => {
          if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) throw new Error('WebRTC 연결이 끊겼습니다.');
          return peer.connectionState === 'connected';
        }, signal);
      }, connection.controller.signal);
    } catch (error) {
      if (this.connection === connection) this.close();
      throw error;
    }
  }

  close() {
    const connection = this.connection;
    this.connection = null;
    if (!connection) return;
    connection.controller.abort();
    connection.peer.ontrack = null;
    connection.peer.onconnectionstatechange = null;
    connection.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    connection.peer.close();
    if (connection.sessionUrl) this.deleteSession(connection.sessionUrl);
  }

  private deleteSession(url: string) {
    // 원격 정리를 기다리지 않고 로컬 종료와 다음 연결을 진행한다.
    void videoOperation((signal) => this.fetchFn(url, { method: 'DELETE', signal })).catch(() => undefined);
  }
}

function waitForState(peer: RTCPeerConnection, event: string, ready: () => boolean, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      peer.removeEventListener(event, check);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(signal.reason); };
    const check = () => {
      try {
        signal.throwIfAborted();
        if (ready()) { cleanup(); resolve(); }
      } catch (error) { cleanup(); reject(error); }
    };
    peer.addEventListener(event, check);
    signal.addEventListener('abort', abort, { once: true });
    check();
  });
}
