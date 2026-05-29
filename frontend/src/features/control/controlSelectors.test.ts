import { beforeEach, describe, expect, it } from 'vitest';
import { useControlStore } from './controlStore';
import { canControlRobot, canResetAfterEmergency } from './controlSelectors';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { resetStores, holdControl, TEST_ROBOT_ID } from '../../test/testStores';

describe('control selectors', () => {
  beforeEach(() => {
    resetStores();
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
