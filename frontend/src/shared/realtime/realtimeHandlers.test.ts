import { beforeEach, describe, expect, it } from 'vitest';
import { useControlStore } from '../../features/control/controlStore';
import { useRobotStore } from '../../features/robots/robotStore';
import { useTelemetryStore } from '../../features/telemetry/telemetryStore';
import { resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { applyRealtimeMessage } from './realtimeHandlers';

describe('applyRealtimeMessage', () => {
  beforeEach(() => {
    resetStores();
  });

  it('updates telemetry and robot transport status', () => {
    applyRealtimeMessage({
      type: 'telemetry',
      payload: {
        robotId: TEST_ROBOT_ID,
        latitude: 37.5,
        longitude: 127,
        batteryLevel: 100,
        mode: 'idle',
        workState: 'idle',
        speedMps: 0,
        signalStrength: 100,
        lastReceivedAt: '2026-06-13T01:00:00Z',
      },
    });
    applyRealtimeMessage({
      type: 'status',
      payload: {
        robotId: TEST_ROBOT_ID,
        connectionState: 'online',
        mqttState: 'connected',
        wssState: 'connected',
        edgeState: 'connected',
        lastSeenAt: '2026-06-13T01:00:00Z',
        stale: false,
      },
    });

    expect(useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID].batteryLevel).toBe(100);
    expect(useTelemetryStore.getState().statusByRobotId[TEST_ROBOT_ID].stale).toBe(false);
    expect(useRobotStore.getState().robots.find((robot) => robot.id === TEST_ROBOT_ID)?.connectionState).toBe('online');
  });

  it('updates control lock and command event state', () => {
    applyRealtimeMessage({
      type: 'control-lock',
      payload: {
        robotId: TEST_ROBOT_ID,
        lockState: 'held',
        controlOwner: 'admin',
        controlOwnerName: 'ADMIN USER',
        mode: 'manual',
        emergency: false,
        lockVersion: 7,
        expiresAt: '2026-06-13T01:05:00Z',
        reason: 'claim-control',
        updatedAt: '2026-06-13T01:00:00Z',
      },
    });
    applyRealtimeMessage({
      type: 'control-events',
      payload: {
        robotId: TEST_ROBOT_ID,
        commandId: 'cmd-001',
        commandType: 'manual-command',
        status: 'edge-timeout',
        reason: 'ack-timeout',
        requestedBy: 'admin',
        serverTimestamp: '2026-06-13T01:00:05Z',
        edgeAckAt: null,
      },
    });

    const state = useControlStore.getState().getControlState(TEST_ROBOT_ID);
    expect(state.lockState).toBe('held');
    expect(state.controlOwner).toBe('admin');
    expect(state.lockVersion).toBe(7);
    expect(state.lastCommandEvent).toMatchObject({
      commandId: 'cmd-001',
      status: 'edge-timeout',
    });
    expect(state.commandError).toBe('ack-timeout');
  });

  it('applies emergency telemetry to the control safety state', () => {
    applyRealtimeMessage({
      type: 'telemetry',
      payload: {
        robotId: TEST_ROBOT_ID,
        latitude: 37.5,
        longitude: 127,
        batteryLevel: 100,
        mode: 'emergency',
        workState: 'error',
        speedMps: 0,
        signalStrength: 100,
        lastReceivedAt: '2026-06-13T01:00:00Z',
        errorState: 'emergency-stop-active',
      },
    });

    expect(useControlStore.getState().getControlState(TEST_ROBOT_ID)).toMatchObject({
      mode: 'emergency',
      emergency: true,
      manualActive: false,
    });
  });
});
