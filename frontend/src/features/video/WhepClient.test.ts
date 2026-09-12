import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhepClient } from './WhepClient';
import { VIDEO_TIMEOUT_MS } from './videoOperation';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('WhepClient', () => {
  it('fetch를 전역 객체 컨텍스트로 호출한다', async () => {
    const peerConnection = createPeerConnection();
    const fetchFn = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(new Response('answer-sdp', { status: 201 }));
    });
    const client = new WhepClient({
      createPeerConnection: () => peerConnection,
      fetchFn,
    });

    await client.connect('http://100.92.7.56:8889/mowers/MOWER-01/whep');

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('WHEP endpoint에 SDP offer를 보내고 answer를 적용한다', async () => {
    const peerConnection = createPeerConnection();
    const fetchFn = vi.fn().mockResolvedValue(new Response('answer-sdp', {
      status: 201,
      headers: { Location: 'session/123' },
    }));
    const client = new WhepClient({
      createPeerConnection: () => peerConnection,
      fetchFn,
    });

    await client.connect('http://100.92.7.56:8889/mowers/MOWER-01/whep');

    expect(fetchFn).toHaveBeenCalledWith(
      'http://100.92.7.56:8889/mowers/MOWER-01/whep',
      expect.objectContaining({
        method: 'POST',
        body: 'offer-sdp',
      }),
    );
    expect(peerConnection.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp',
    });
  });

  it('종료할 때 MediaMTX WHEP 세션을 삭제한다', async () => {
    const peerConnection = createPeerConnection();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('answer-sdp', {
        status: 201,
        headers: { Location: 'session/123' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = new WhepClient({
      createPeerConnection: () => peerConnection,
      fetchFn,
    });

    await client.connect('http://100.92.7.56:8889/mowers/MOWER-01/whep');
    await client.close();

    expect(fetchFn).toHaveBeenLastCalledWith(
      'http://100.92.7.56:8889/mowers/MOWER-01/session/123',
      expect.objectContaining({ method: 'DELETE', signal: expect.any(AbortSignal) }),
    );
    expect(peerConnection.close).toHaveBeenCalled();
  });

  it('DELETE가 응답하지 않아도 로컬 연결은 즉시 종료한다', async () => {
    const peerConnection = createPeerConnection();
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('answer', {
      status: 201, headers: { Location: '/session/old' },
    })).mockReturnValue(new Promise(() => {}));
    const client = new WhepClient({ createPeerConnection: () => peerConnection, fetchFn });
    await client.connect('https://video.invalid/whep');
    void client.close();
    expect(peerConnection.close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(VIDEO_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['ice', 'http', 'body', 'peer', 'offer'])('%s 대기 시간 초과 시 연결과 핸들러를 정리한다', async (stage) => {
    const peer = createPeerConnection();
    if (stage === 'ice') Object.defineProperty(peer, 'iceGatheringState', { value: 'gathering' });
    if (stage === 'peer') Object.defineProperty(peer, 'connectionState', { value: 'connecting' });
    if (stage === 'offer') vi.mocked(peer.createOffer).mockReturnValue(new Promise(() => {}));
    const response = new Response('answer', { status: 201 });
    if (stage === 'body') vi.spyOn(response, 'text').mockReturnValue(new Promise(() => {}));
    const fetchFn = vi.fn().mockImplementation(() => stage === 'http' ? new Promise(() => {}) : Promise.resolve(response));
    const client = new WhepClient({ createPeerConnection: () => peer, fetchFn });
    const result = expect(client.connect('https://video.invalid/whep')).rejects.toThrow('시간이 초과');
    await vi.advanceTimersByTimeAsync(VIDEO_TIMEOUT_MS);
    await result;
    expect(peer.close).toHaveBeenCalledOnce();
    expect(peer.ontrack).toBeNull();
    expect(peer.onconnectionstatechange).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('취소 후 늦은 Location은 삭제하고 새 연결의 상태와 SDP는 건드리지 않는다', async () => {
    const firstPeer = createPeerConnection();
    const secondPeer = createPeerConnection();
    let resolve!: (response: Response) => void;
    const fetchFn = vi.fn().mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; }))
      .mockImplementation(() => Promise.resolve(new Response('answer', { status: 201 })));
    const onRemoteStream = vi.fn();
    const client = new WhepClient({ createPeerConnection: vi.fn().mockReturnValueOnce(firstPeer).mockReturnValueOnce(secondPeer), fetchFn, onRemoteStream });
    const first = client.connect('https://video.invalid/a');
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const oldTrack = firstPeer.ontrack;
    await vi.advanceTimersByTimeAsync(0);
    client.close();
    await rejected;
    await client.connect('https://video.invalid/b');
    oldTrack?.call(firstPeer, { streams: [{}] } as unknown as RTCTrackEvent);
    resolve(new Response('old', { status: 201, headers: { Location: '/old-session' } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(firstPeer.setRemoteDescription).not.toHaveBeenCalled();
    expect(secondPeer.close).not.toHaveBeenCalled();
    expect(onRemoteStream).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledWith('https://video.invalid/old-session', expect.objectContaining({ method: 'DELETE' }));
    client.close();
  });

  it('ICE 중 취소하면 이벤트 리스너를 제거한다', async () => {
    const peer = createPeerConnection();
    Object.defineProperty(peer, 'iceGatheringState', { value: 'gathering' });
    const fetchFn = vi.fn();
    const client = new WhepClient({ createPeerConnection: () => peer, fetchFn });
    const pending = expect(client.connect('https://video.invalid/whep')).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    client.close();
    await pending;
    expect(peer.removeEventListener).toHaveBeenCalledWith('icegatheringstatechange', expect.any(Function));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('answer 적용 실패 시 이미 발급된 세션을 삭제한다', async () => {
    const peer = createPeerConnection();
    vi.mocked(peer.setRemoteDescription).mockRejectedValue(new Error('invalid answer'));
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(new Response('answer', {
      status: 201, headers: { Location: '/resource' },
    })));
    const client = new WhepClient({ createPeerConnection: () => peer, fetchFn });
    await expect(client.connect('https://video.invalid/whep')).rejects.toThrow('invalid answer');
    expect(fetchFn).toHaveBeenCalledWith('https://video.invalid/resource', expect.objectContaining({ method: 'DELETE' }));
    expect(peer.close).toHaveBeenCalled();
  });

  it('SDP 교환 후 실제 연결 이벤트를 기다리고 수신 트랙을 종료한다', async () => {
    const peer = createPeerConnection();
    const events = new EventTarget();
    vi.mocked(peer.addEventListener).mockImplementation(events.addEventListener.bind(events));
    vi.mocked(peer.removeEventListener).mockImplementation(events.removeEventListener.bind(events));
    Object.defineProperty(peer, 'connectionState', { configurable: true, value: 'connecting' });
    const onConnectionStateChange = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue(new Response('answer', { status: 201 }));
    const client = new WhepClient({ createPeerConnection: () => peer, fetchFn, onConnectionStateChange });
    const done = vi.fn();
    const pending = client.connect('https://video.invalid/whep').then(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(peer.setRemoteDescription).toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    const stop = vi.fn();
    peer.ontrack?.call(peer, { streams: [{ getTracks: () => [{ stop }] }] } as unknown as RTCTrackEvent);
    Object.defineProperty(peer, 'connectionState', { value: 'connected' });
    peer.onconnectionstatechange?.call(peer, new Event('connectionstatechange'));
    events.dispatchEvent(new Event('connectionstatechange'));
    await pending;
    expect(onConnectionStateChange).toHaveBeenCalledWith('connected');
    client.close();
    client.close();
    expect(stop).toHaveBeenCalledOnce();
    expect(peer.ontrack).toBeNull();
    expect(peer.onconnectionstatechange).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function createPeerConnection() {
  return {
    addTransceiver: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'offer-sdp' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    localDescription: { type: 'offer', sdp: 'offer-sdp' },
    iceGatheringState: 'complete',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    connectionState: 'connected',
    ontrack: null,
    onconnectionstatechange: null,
  } as unknown as RTCPeerConnection;
}
