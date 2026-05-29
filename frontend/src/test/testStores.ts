import { useAuthStore } from '../features/auth/authStore';
import { useControlStore } from '../features/control/controlStore';
import { useRobotStore } from '../features/robots/robotStore';
import { mockRobots } from '../features/robots/mockRobots';
import { mockTelemetry } from '../features/telemetry/mockTelemetry';
import { useTelemetryStore } from '../features/telemetry/telemetryStore';
import { useVideoStore } from '../features/video/videoStore';
import type { Role } from '../features/auth/types';
import type { ControlState } from '../features/control/types';

export const TEST_ROBOT_ID = 'MOWER-01';
export const TEST_USER_ID = 'admin';

export function resetStores(role: Role = 'admin') {
  useAuthStore.setState({
    user: {
      id: TEST_USER_ID,
      name: 'ADMIN USER',
      role,
    },
    accessToken: 'test-access-token',
    isAuthenticated: true,
  });

  useRobotStore.setState({
    robots: mockRobots,
    selectedRobotId: TEST_ROBOT_ID,
  });

  useTelemetryStore.setState({
    telemetryByRobotId: mockTelemetry,
    connectionState: 'mock',
    protocolState: {
      https: 'connected',
      wss: 'mock',
      mqtt: 'connected',
    },
  });

  useControlStore.setState({
    controlByRobotId: {},
  });

  useVideoStore.setState({
    sessionsByRobotId: {},
  });
}

export function holdControl(patch: Partial<ControlState> = {}) {
  useControlStore.getState().patchControlState(TEST_ROBOT_ID, {
    lockState: 'held',
    controlOwner: TEST_USER_ID,
    mode: 'manual',
    emergency: false,
    manualActive: false,
    ...patch,
  });
}
