import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRobotStore } from './robotStore';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { mockRobots } from './mockRobots';

vi.mock('../../shared/config/env', () => ({ env: { enableMockRobots: false, enableMockRealtime: false } }));

describe('실제 장비 초기 상태와 선택', () => {
  beforeEach(() => useRobotStore.setState(useRobotStore.getInitialState(), true));

  it('조회 또는 수신 전까지 샘플 장비와 텔레메트리가 없다', () => {
    expect(useRobotStore.getState().robots).toEqual([]);
    expect(useRobotStore.getState().selectedRobotId).toBeNull();
    expect(useTelemetryStore.getInitialState().telemetryByRobotId).toEqual({});
    expect(useTelemetryStore.getInitialState().connectionState).toBe('disconnected');
    expect(useTelemetryStore.getInitialState().protocolState.mqtt).toBe('disconnected');
  });

  it('선택이 사라지면 첫 유효 로봇, 빈 목록이면 선택 없음으로 바꾼다', () => {
    const robot = mockRobots[0];
    useRobotStore.getState().setRobots([robot]);
    useRobotStore.getState().setRobots([{ ...robot, id: 'replacement' }]);
    expect(useRobotStore.getState().selectedRobotId).toBe('replacement');
    useRobotStore.getState().setRobots([]);
    expect(useRobotStore.getState().selectedRobotId).toBeNull();
  });
});
