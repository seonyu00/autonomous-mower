import { describe, expect, it, vi } from 'vitest';
import { WhepClient } from './WhepClient';

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
      { method: 'DELETE' },
    );
    expect(peerConnection.close).toHaveBeenCalled();
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
    connectionState: 'new',
    ontrack: null,
    onconnectionstatechange: null,
  } as unknown as RTCPeerConnection;
}
