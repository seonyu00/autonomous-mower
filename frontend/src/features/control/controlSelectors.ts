import { useAuthStore } from '../auth/authStore';
import { hasPermission } from '../../shared/lib/permissions';
import { useRobotStore } from '../robots/robotStore';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { useControlStore } from './controlStore';

export type ControlEligibility = {
  allowed: boolean;
  reasons: string[];
};

export function canControlRobot(robotId: string): ControlEligibility {
  const reasons: string[] = [];
  const { user, isAuthenticated } = useAuthStore.getState();
  const { selectedRobotId } = useRobotStore.getState();
  const { connectionState, protocolState } = useTelemetryStore.getState();
  const controlState = useControlStore.getState().getControlState(robotId);

  if (!isAuthenticated || !user) {
    reasons.push('not-authenticated');
  } else if (!hasPermission(user.role, 'control:write')) {
    reasons.push('missing-control-permission');
  }

  if (selectedRobotId !== robotId) {
    reasons.push('robot-not-selected');
  }

  if (controlState.lockState !== 'held') {
    reasons.push('control-lock-not-held');
  }

  if (controlState.controlOwner && user && controlState.controlOwner !== user.id) {
    reasons.push('control-owned-by-other-user');
  }

  if (connectionState !== 'connected' && connectionState !== 'mock') {
    reasons.push(`realtime-${connectionState}`);
  }

  if (controlState.emergency || controlState.mode === 'emergency') {
    reasons.push('robot-in-emergency');
  }

  if (protocolState.https !== 'connected' || protocolState.wss === 'disconnected' || protocolState.wss === 'degraded') {
    reasons.push('transport-not-ready');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function canSendEmergencyStop(robotId: string): ControlEligibility {
  const reasons: string[] = [];
  const { user, isAuthenticated } = useAuthStore.getState();
  const { selectedRobotId } = useRobotStore.getState();
  const { protocolState } = useTelemetryStore.getState();

  if (!isAuthenticated || !user) {
    reasons.push('not-authenticated');
  } else if (!hasPermission(user.role, 'control:write')) {
    reasons.push('missing-control-permission');
  }

  if (selectedRobotId !== robotId) {
    reasons.push('robot-not-selected');
  }

  if (protocolState.https !== 'connected') {
    reasons.push('transport-not-ready');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function canResetAfterEmergency(robotId: string): ControlEligibility {
  const reasons: string[] = [];
  const { user, isAuthenticated } = useAuthStore.getState();
  const { selectedRobotId } = useRobotStore.getState();
  const { protocolState } = useTelemetryStore.getState();
  const controlState = useControlStore.getState().getControlState(robotId);

  if (!isAuthenticated || !user) {
    reasons.push('not-authenticated');
  } else if (!hasPermission(user.role, 'control:write')) {
    reasons.push('missing-control-permission');
  }

  if (selectedRobotId !== robotId) {
    reasons.push('robot-not-selected');
  }

  if (!controlState.emergency && controlState.mode !== 'emergency') {
    reasons.push('robot-not-in-emergency');
  }

  if (protocolState.https !== 'connected') {
    reasons.push('transport-not-ready');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function canSendStopCommand(robotId: string): ControlEligibility {
  const reasons: string[] = [];
  const { user, isAuthenticated } = useAuthStore.getState();
  const { selectedRobotId } = useRobotStore.getState();
  const { protocolState } = useTelemetryStore.getState();
  const controlState = useControlStore.getState().getControlState(robotId);

  if (!isAuthenticated || !user) {
    reasons.push('not-authenticated');
  } else if (!hasPermission(user.role, 'control:write')) {
    reasons.push('missing-control-permission');
  }

  if (selectedRobotId !== robotId) {
    reasons.push('robot-not-selected');
  }

  if (controlState.lockState !== 'held') {
    reasons.push('control-lock-not-held');
  }

  if (controlState.controlOwner && user && controlState.controlOwner !== user.id) {
    reasons.push('control-owned-by-other-user');
  }

  if (protocolState.https !== 'connected') {
    reasons.push('transport-not-ready');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
