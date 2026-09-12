import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoStore } from './videoStore';
import { useAuthStore } from '../auth/authStore';

const {
  connect,
  close,
  startSignaling,
  stopSignaling,
  reconnectSignaling,
  callbacks,
} = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  startSignaling: vi.fn(),
  stopSignaling: vi.fn(),
  reconnectSignaling: vi.fn(),
  callbacks: [] as Array<{ onRemoteStream: (stream: MediaStream) => void; onConnectionStateChange: (state: RTCPeerConnectionState) => void }>,
}));

vi.mock('./WhepClient', () => ({
  WhepClient: class {
    constructor(options: typeof callbacks[number]) { callbacks.push(options); }
    connect = connect;
    close = close;
  },
}));

vi.mock('./signalingApi', () => ({
  startStream: startSignaling,
  stopStream: stopSignaling,
  reconnectStream: reconnectSignaling,
}));

import { WebRTCClient } from './WebRtcClient';

describe('WebRTCClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    callbacks.length = 0;
    stopSignaling.mockResolvedValue(undefined);
    useVideoStore.setState({ sessionsByRobotId: {} });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('백엔드에서 발급받은 WHEP URL로 영상을 연결한다', async () => {
    startSignaling.mockResolvedValue({
      sessionId: 'video-session-001',
      robotId: 'MOWER-01',
      whepUrl: 'http://100.92.7.56:8889/mowers/MOWER-01/whep',
      state: 'connecting',
      createdAt: '2026-06-13T08:00:00Z',
      mock: false,
    });
    const client = new WebRTCClient();

    await client.startStream('MOWER-01');

    expect(startSignaling).toHaveBeenCalledWith('MOWER-01', {
      robotId: 'MOWER-01',
      width: 640,
      height: 480,
      fps: 15,
      maxBitrateKbps: 500,
    }, expect.any(AbortSignal));
    expect(connect).toHaveBeenCalledWith(
      'http://100.92.7.56:8889/mowers/MOWER-01/whep',
    );
  });

  it('영상 중지 시 WHEP 세션과 백엔드 세션을 모두 닫는다', async () => {
    startSignaling.mockResolvedValue({
      sessionId: 'video-session-001',
      robotId: 'MOWER-01',
      whepUrl: 'http://100.92.7.56:8889/mowers/MOWER-01/whep',
      state: 'connecting',
      createdAt: '2026-06-13T08:00:00Z',
      mock: false,
    });
    const client = new WebRTCClient();
    await client.startStream('MOWER-01');

    await client.stopStream('MOWER-01');

    expect(close).toHaveBeenCalled();
    expect(stopSignaling).toHaveBeenCalledWith('MOWER-01', 'video-session-001', expect.any(AbortSignal));
  });

  it('로그아웃 후 도착한 영상 세션은 연결하거나 store에 복원하지 않는다', async () => {
    let resolve!: (value: unknown) => void;
    startSignaling.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const client = new WebRTCClient();
    const pending = client.startStream('MOWER-01');
    await vi.advanceTimersByTimeAsync(0);
    useAuthStore.getState().clearSession();
    resolve({ robotId: 'MOWER-01', sessionId: 'old', mock: false, whepUrl: 'https://unused.invalid/whep' });
    await pending;
    await client.stopStream();
    expect(connect).not.toHaveBeenCalled();
    expect(stopSignaling).not.toHaveBeenCalled();
    expect(useVideoStore.getState().sessionsByRobotId).toEqual({});
  });

  it('시그널링 중 취소하고 늦게 발급된 세션을 정리한다', async () => {
    let resolve!: (value: unknown) => void;
    startSignaling.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const client = new WebRTCClient();
    const pending = client.startStream('A');
    await vi.advanceTimersByTimeAsync(0);
    await client.stopStream();
    await pending;
    expect(useVideoStore.getState().getSession('A')).toMatchObject({ loading: false, connectionState: 'disconnected', stream: null });
    resolve(session('A', 'late'));
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).not.toHaveBeenCalled();
    expect(stopSignaling).toHaveBeenCalledWith('A', 'late', expect.any(AbortSignal));
  });

  it('A의 늦은 응답·트랙·실패가 B 연결을 덮지 않는다', async () => {
    let resolve!: (value: unknown) => void;
    startSignaling.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(session('B', 'new'));
    const remote = vi.fn();
    const client = new WebRTCClient({ onRemoteStream: remote });
    const first = client.startStream('A');
    await vi.advanceTimersByTimeAsync(0);
    await client.startStream('B');
    await first;
    const old = callbacks[0];
    old.onRemoteStream({} as MediaStream);
    old.onConnectionStateChange('failed');
    resolve(session('A', 'old'));
    await vi.advanceTimersByTimeAsync(0);
    expect(useVideoStore.getState().getSession('B')).toMatchObject({ sessionId: 'new', connectionState: 'connected', stream: null });
    expect(remote.mock.calls).toEqual([[null]]);
    expect(connect).toHaveBeenCalledTimes(1);
    await client.stopStream();
  });

  it('트랙 도착은 PeerConnection 연결 완료로 간주하지 않는다', async () => {
    startSignaling.mockResolvedValue(session('A', 'one'));
    let finish!: () => void;
    connect.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const client = new WebRTCClient();
    const pending = client.startStream('A');
    await vi.advanceTimersByTimeAsync(0);
    callbacks[0].onRemoteStream({} as MediaStream);
    expect(useVideoStore.getState().getSession('A')).toMatchObject({ connectionState: 'connecting', frameReceiving: false });
    callbacks[0].onConnectionStateChange('connected');
    finish();
    await pending;
    expect(useVideoStore.getState().getSession('A')).toMatchObject({ connectionState: 'connected', frameReceiving: false });
    await client.stopStream();
  });

  it('시그널링 시간 초과는 실패로 종료하고 재연결할 수 있다', async () => {
    startSignaling.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(session('A', 'retry'));
    const client = new WebRTCClient();
    const first = client.startStream('A');
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
    expect(useVideoStore.getState().getSession('A')).toMatchObject({ connectionState: 'failed', sessionId: null, loading: false });
    await client.reconnect('A');
    expect(useVideoStore.getState().getSession('A').sessionId).toBe('retry');
    await client.stopStream();
  });

  it('중지 응답이 멈춰도 재연결 상태를 덮지 않는다', async () => {
    startSignaling.mockResolvedValueOnce(session('A', 'one')).mockResolvedValueOnce(session('A', 'two'));
    stopSignaling.mockReturnValue(new Promise(() => {}));
    const client = new WebRTCClient();
    await client.startStream('A');
    await client.stopStream();
    expect(useVideoStore.getState().getSession('A').connectionState).toBe('disconnected');
    await client.startStream('A');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(useVideoStore.getState().getSession('A')).toMatchObject({ sessionId: 'two', connectionState: 'connected' });
    await client.stopStream();
  });

  it('재연결 실패 시 이전 세션과 새 PeerConnection을 정리한다', async () => {
    startSignaling.mockResolvedValue(session('A', 'one'));
    reconnectSignaling.mockRejectedValue(new Error('reconnect failed'));
    const client = new WebRTCClient();
    await client.startStream('A');
    await client.reconnect('A');
    expect(stopSignaling).toHaveBeenCalledWith('A', 'one', expect.any(AbortSignal));
    expect(useVideoStore.getState().getSession('A')).toMatchObject({ sessionId: null, stream: null, connectionState: 'failed' });
  });
});

function session(robotId: string, sessionId: string) {
  return { robotId, sessionId, whepUrl: `https://video.invalid/${robotId}`, state: 'connecting', mock: false };
}
