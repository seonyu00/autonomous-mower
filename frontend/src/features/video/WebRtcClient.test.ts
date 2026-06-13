import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoStore } from './videoStore';

const {
  connect,
  close,
  startSignaling,
  stopSignaling,
} = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  startSignaling: vi.fn(),
  stopSignaling: vi.fn(),
}));

vi.mock('./WhepClient', () => ({
  WhepClient: class {
    connect = connect;
    close = close;
  },
}));

vi.mock('./signalingApi', () => ({
  startStream: startSignaling,
  stopStream: stopSignaling,
  reconnectStream: vi.fn(),
}));

import { WebRTCClient } from './WebRtcClient';

describe('WebRTCClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVideoStore.setState({ sessionsByRobotId: {} });
  });

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
    });
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
    expect(stopSignaling).toHaveBeenCalledWith('MOWER-01', 'video-session-001');
  });
});
