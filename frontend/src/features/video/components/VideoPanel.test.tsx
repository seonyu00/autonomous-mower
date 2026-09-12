import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetStores } from '../../../test/testStores';
import { useRobotStore } from '../../robots/robotStore';
import { useVideoStore } from '../videoStore';
import { useAuthStore } from '../../auth/authStore';
import { env } from '../../../shared/config/env';
import { VideoPanel } from './VideoPanel';

const clients = vi.hoisted(() => [] as Array<{ startStream: ReturnType<typeof vi.fn>; stopStream: ReturnType<typeof vi.fn> }>);
vi.mock('../WebRtcClient', () => ({
  WebRTCClient: class {
    robotId: string | null = null;
    startStream = vi.fn((robotId: string) => {
      this.robotId = robotId;
      useVideoStore.getState().patchSession(robotId, { connectionState: 'connecting', loading: true });
    });
    stopStream = vi.fn(() => {
      if (!this.robotId) return;
      useVideoStore.getState().patchSession(this.robotId, { stream: null, connectionState: 'disconnected', loading: false,
        frameReceiving: false, lastFrameAt: null });
      this.robotId = null;
    });
    reconnect = vi.fn();
    constructor() { clients.push(this); }
  },
}));

let frameCallbacks: Map<number, VideoFrameRequestCallback>;
let nextFrame: number;
beforeEach(() => {
  resetStores();
  env.enableMockVideo = false;
  clients.length = 0;
  frameCallbacks = new Map();
  nextFrame = 0;
  vi.useFakeTimers();
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { configurable: true,
    value: vi.fn((callback: VideoFrameRequestCallback) => { frameCallbacks.set(++nextFrame, callback); return nextFrame; }) });
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true,
    value: vi.fn((id: number) => frameCallbacks.delete(id)) });
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
});

function start() {
  fireEvent.click(screen.getByRole('button', { name: '스트림 시작' }));
}

function supplyStream(robotId = 'MOWER-01') {
  const stream = { id: robotId } as MediaStream;
  act(() => useVideoStore.getState().patchSession(robotId, { stream, connectionState: 'connected', loading: false }));
  return stream;
}

it('연결 중에도 취소할 수 있다', () => {
  render(<VideoPanel />);
  start();
  expect(screen.getByRole('button', { name: '연결 취소' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '연결 취소' }));
  expect(clients[0].stopStream).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '스트림 시작' })).toBeEnabled();
});

it('PeerConnection 연결과 프레임 수신·중단을 구분한다', () => {
  render(<VideoPanel />);
  start();
  supplyStream();
  expect(screen.getByText('연결됨')).toBeInTheDocument();
  expect(screen.getByText('프레임 수신 대기')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '스냅샷' })).toBeDisabled();
  act(() => frameCallbacks.get(1)?.(0, {} as VideoFrameCallbackMetadata));
  expect(screen.getByText('프레임 수신 중')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '스냅샷' })).toBeEnabled();
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.getByText('프레임 수신 중단')).toBeInTheDocument();
  expect(screen.getByText('연결됨')).toBeInTheDocument();
  act(() => frameCallbacks.get(2)?.(0, {} as VideoFrameCallbackMetadata));
  expect(screen.getByText('프레임 수신 중')).toBeInTheDocument();
});

it('로봇 전환 때 A 영상을 비우고 늦은 프레임 콜백을 무시한다', () => {
  render(<VideoPanel />);
  start();
  const aStream = supplyStream();
  const aVideo = screen.getByLabelText('로봇 실시간 카메라 스트림') as HTMLVideoElement;
  expect(aVideo.srcObject).toBe(aStream);
  const oldFrame = frameCallbacks.get(1);
  act(() => useRobotStore.getState().selectRobot('MOWER-02'));
  expect(aVideo.srcObject).toBeNull();
  expect(clients[0].stopStream).toHaveBeenCalled();
  start();
  const bStream = supplyStream('MOWER-02');
  const bVideo = screen.getByLabelText('로봇 실시간 카메라 스트림') as HTMLVideoElement;
  expect(bVideo).not.toBe(aVideo);
  expect(bVideo.srcObject).toBe(bStream);
  act(() => oldFrame?.(0, {} as VideoFrameCallbackMetadata));
  expect(useVideoStore.getState().getSession('MOWER-02').frameReceiving).toBe(false);
  expect(bVideo.srcObject).toBe(bStream);
});

it('종료 시 프레임 콜백·타이머·페이지 이벤트를 정리한다', () => {
  const removeWindow = vi.spyOn(window, 'removeEventListener');
  const removeDocument = vi.spyOn(document, 'removeEventListener');
  const { unmount } = render(<VideoPanel />);
  start();
  supplyStream();
  const video = screen.getByLabelText('로봇 실시간 카메라 스트림') as HTMLVideoElement;
  unmount();
  expect(video.srcObject).toBeNull();
  expect(frameCallbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(removeWindow).toHaveBeenCalledWith('pagehide', expect.any(Function));
  expect(removeWindow).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  removeWindow.mockRestore();
  removeDocument.mockRestore();
});

it('새 로그인 세션에서는 새 클라이언트를 사용한다', () => {
  render(<VideoPanel />);
  act(() => useAuthStore.setState((state) => ({ sessionVersion: state.sessionVersion + 1 })));
  start();
  expect(clients[0].stopStream).toHaveBeenCalled();
  expect(clients[1].startStream).toHaveBeenCalledWith('MOWER-01');
});

it('샘플 연결을 실제 프레임 수신으로 표시하지 않는다', () => {
  env.enableMockVideo = true;
  render(<VideoPanel />);
  expect(screen.getByText('샘플 모드')).toBeInTheDocument();
  expect(screen.getByText('샘플 · 실제 프레임 없음')).toBeInTheDocument();
});
