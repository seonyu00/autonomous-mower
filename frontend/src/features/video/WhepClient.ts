type WhepClientOptions = {
  createPeerConnection?: () => RTCPeerConnection;
  fetchFn?: typeof fetch;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
};

export class WhepClient {
  private peerConnection: RTCPeerConnection | null = null;
  private sessionUrl: string | null = null;
  private readonly createPeerConnection: () => RTCPeerConnection;
  private readonly fetchFn: typeof fetch;
  private readonly onRemoteStream?: (stream: MediaStream) => void;
  private readonly onConnectionStateChange?: (state: RTCPeerConnectionState) => void;

  constructor(options: WhepClientOptions = {}) {
    this.createPeerConnection = options.createPeerConnection ?? (() => new RTCPeerConnection());
    this.fetchFn = (options.fetchFn ?? fetch).bind(globalThis);
    this.onRemoteStream = options.onRemoteStream;
    this.onConnectionStateChange = options.onConnectionStateChange;
  }

  async connect(whepUrl: string) {
    await this.close();

    const peerConnection = this.createPeerConnection();
    this.peerConnection = peerConnection;
    peerConnection.addTransceiver('video', { direction: 'recvonly' });
    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.onRemoteStream?.(stream);
      }
    };
    peerConnection.onconnectionstatechange = () => {
      this.onConnectionStateChange?.(peerConnection.connectionState);
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGathering(peerConnection);

    const localSdp = peerConnection.localDescription?.sdp;
    if (!localSdp) {
      throw new Error('WebRTC SDP offer를 생성하지 못했습니다.');
    }

    const response = await this.fetchFn(whepUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/sdp',
        'Content-Type': 'application/sdp',
      },
      body: localSdp,
    });
    if (!response.ok) {
      throw new Error(`WHEP 연결에 실패했습니다. (${response.status})`);
    }

    const answerSdp = await response.text();
    await peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    });

    const location = response.headers.get('Location');
    this.sessionUrl = location ? new URL(location, whepUrl).toString() : null;
  }

  async close() {
    const sessionUrl = this.sessionUrl;
    this.sessionUrl = null;

    if (sessionUrl) {
      await this.fetchFn(sessionUrl, { method: 'DELETE' }).catch(() => undefined);
    }

    this.peerConnection?.close();
    this.peerConnection = null;
  }
}

function waitForIceGathering(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState === 'complete') {
        peerConnection.removeEventListener('icegatheringstatechange', handleStateChange);
        resolve();
      }
    };
    peerConnection.addEventListener('icegatheringstatechange', handleStateChange);
  });
}
