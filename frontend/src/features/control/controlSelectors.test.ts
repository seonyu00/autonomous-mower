import { beforeEach, describe, expect, it } from 'vitest';
import { useControlStore } from './controlStore';
import { canControlRobot, canResetAfterEmergency, canSendStopCommand } from './controlSelectors';
import { useRobotStore } from '../robots/robotStore';
import { useAuthStore } from '../auth/authStore';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { resetStores, holdControl, TEST_ROBOT_ID } from '../../test/testStores';

describe('control selectors', () => {
  beforeEach(() => {
    resetStores();
  });

  it('이전 로봇 정지는 선택 검사만 생략하고 소유권과 인증은 유지한다', () => {
    holdControl();
    useRobotStore.setState({ selectedRobotId: 'MOWER-02' });
    expect(canSendStopCommand(TEST_ROBOT_ID).reasons).toContain('robot-not-selected');
    expect(canSendStopCommand(TEST_ROBOT_ID, true).allowed).toBe(true);
    holdControl({ controlOwner: 'other-user' });
    expect(canSendStopCommand(TEST_ROBOT_ID, true).reasons).toContain('control-owned-by-other-user');
    holdControl({ lockState: 'revoked' });
    expect(canSendStopCommand(TEST_ROBOT_ID, true).reasons).toContain('control-lock-not-held');
    useAuthStore.setState({ isAuthenticated: false, user: null });
    expect(canSendStopCommand(TEST_ROBOT_ID, true).reasons).toContain('not-authenticated');
  });

  describe('canControlRobot', () => {
    it('allows control when RBAC, ownership, realtime, and transport prechecks pass', () => {
      holdControl();

      expect(canControlRobot(TEST_ROBOT_ID)).toEqual({
        allowed: true,
        reasons: [],
      });
    });

    it('blocks control when the lock is not held', () => {
      const result = canControlRobot(TEST_ROBOT_ID);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('control-lock-not-held');
    });

    it('blocks control when realtime is degraded', () => {
      holdControl();
      useTelemetryStore.getState().setConnectionState('degraded');

      const result = canControlRobot(TEST_ROBOT_ID);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('realtime-degraded');
      expect(result.reasons).toContain('transport-not-ready');
    });

    it('blocks control during E-Stop', () => {
      holdControl({
        emergency: true,
        mode: 'emergency',
      });

      const result = canControlRobot(TEST_ROBOT_ID);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('robot-in-emergency');
    });
  });

  describe('canResetAfterEmergency', () => {
    it('allows reset only when the selected robot is in emergency state', () => {
      holdControl({
        emergency: true,
        mode: 'emergency',
      });

      expect(canResetAfterEmergency(TEST_ROBOT_ID)).toEqual({
        allowed: true,
        reasons: [],
      });
    });

    it('blocks reset when the robot is not in emergency state', () => {
      holdControl();

      const result = canResetAfterEmergency(TEST_ROBOT_ID);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('robot-not-in-emergency');
    });

    it('blocks reset when secure transport is unavailable', () => {
      holdControl({
        emergency: true,
        mode: 'emergency',
      });
      useTelemetryStore.setState((state) => ({
        protocolState: {
          ...state.protocolState,
          https: 'disconnected',
        },
      }));

      const result = canResetAfterEmergency(TEST_ROBOT_ID);

      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('transport-not-ready');
    });
  });

  it('keeps store state scoped by robot id', () => {
    holdControl();
    useControlStore.getState().patchControlState('MOWER-02', {
      lockState: 'held-by-other',
      controlOwner: 'other-operator',
    });

    expect(canControlRobot(TEST_ROBOT_ID).allowed).toBe(true);
    expect(canControlRobot('MOWER-02').reasons).toEqual(
      expect.arrayContaining(['robot-not-selected', 'control-lock-not-held', 'control-owned-by-other-user']),
    );
  });
});
