import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockTelemetry } from './mockTelemetry';
import { useTelemetryStore } from './telemetryStore';
import { useTelemetryReception } from './useTelemetryReception';

const serverStart = Date.parse('2026-09-10T00:00:00Z');
const serverTime = (offset: number) => new Date(serverStart + offset).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  // 브라우저 시각과 서버·Edge 시각이 달라도 경과 시간으로 판정한다.
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  useTelemetryStore.setState(useTelemetryStore.getInitialState(), true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function receive(robotId: string, offset: number) {
  useTelemetryStore.getState().upsertTelemetry({
    ...mockTelemetry['MOWER-01'], robotId,
    lastReceivedAt: serverTime(offset), serverTimestamp: serverTime(offset),
    edgeSampledAt: '2099-01-01T00:00:00Z',
  });
}

it('한 번도 받지 않은 로봇은 시간이 지나도 지연과 구분한다', () => {
  const { result } = renderHook(() => useTelemetryReception('A'));
  act(() => vi.advanceTimersByTime(60000));
  expect(result.current).toEqual({ state: 'never-seen', elapsedMs: null });
});

it('Edge·브라우저 시각과 무관하게 중단을 감지하고 새 수신으로 복구한다', () => {
  receive('A', 0);
  const { result } = renderHook(() => useTelemetryReception('A'));
  expect(result.current.state).toBe('normal');
  act(() => vi.advanceTimersByTime(2999));
  expect(result.current.state).toBe('normal');
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.state).toBe('delayed');
  act(() => receive('A', 3000));
  expect(result.current.state).toBe('normal');
});

it('로봇별 마지막 수신을 독립적으로 판정한다', () => {
  receive('A', 0);
  const { result, rerender } = renderHook(({ id }) => useTelemetryReception(id), { initialProps: { id: 'A' } });
  act(() => vi.advanceTimersByTime(2000));
  act(() => receive('B', 2000));
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.state).toBe('delayed');
  rerender({ id: 'B' });
  expect(result.current.state).toBe('normal');
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.state).toBe('delayed');
});

it('주기적인 status는 텔레메트리 지연 시점을 연장하지 않는다', () => {
  receive('A', 0);
  const { result } = renderHook(() => useTelemetryReception('A'));
  act(() => vi.advanceTimersByTime(2000));
  act(() => useTelemetryStore.getState().upsertStatus({
    robotId: 'A', connectionState: 'online', mqttState: 'connected', wssState: 'connected', edgeState: 'connected',
    lastSeenAt: serverTime(2000), stale: false,
    telemetryReception: { state: 'normal', lastReceivedAt: serverTime(0), edgeSampledAt: null, checkedAt: serverTime(2000) },
  }));
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.state).toBe('delayed');
});

it('조회한 서버 지연 상태를 데이터 프레임 없이도 표시하고 오래된 조회로 되돌리지 않는다', () => {
  const { result } = renderHook(() => useTelemetryReception('A'));
  act(() => useTelemetryStore.getState().upsertReception('A', {
    state: 'delayed', lastReceivedAt: serverTime(0), edgeSampledAt: null, checkedAt: serverTime(10000),
  }));
  expect(result.current.state).toBe('delayed');
  act(() => useTelemetryStore.getState().upsertReception('A', {
    state: 'normal', lastReceivedAt: serverTime(0), edgeSampledAt: null, checkedAt: serverTime(1000),
  }));
  expect(result.current.state).toBe('delayed');
});
