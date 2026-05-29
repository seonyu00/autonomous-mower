import { httpClient } from '../../shared/api/httpClient';
import { useAuthStore } from '../auth/authStore';
import { hasPermission } from '../../shared/lib/permissions';
import { useControlStore } from './controlStore';
import { canControlRobot, canSendEmergencyStop } from './controlSelectors';
import type {
  ControlCommandResult,
  ControlCommandType,
  ControlMode,
  ManualCommand,
  MowerAttachmentAction,
} from './types';

type ControlRequestBody = Record<string, unknown>;

export class ControlPrecheckError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(`Control command blocked: ${reasons.join(', ')}`);
    this.name = 'ControlPrecheckError';
    this.reasons = reasons;
  }
}

export async function claimControl(robotId: string) {
  requireControlPermission();
  useControlStore.getState().patchControlState(robotId, {
    lockState: 'requesting',
    commandError: null,
  });

  return requestControlCommand(robotId, 'claim-control', `/api/control/${robotId}/claim`, {});
}

export async function releaseControl(robotId: string) {
  const state = useControlStore.getState().getControlState(robotId);
  const user = useAuthStore.getState().user;

  requireControlPermission();

  if (state.controlOwner && user && state.controlOwner !== user.id) {
    throw new ControlPrecheckError(['control-owned-by-other-user']);
  }

  return requestControlCommand(robotId, 'release-control', `/api/control/${robotId}/release`, {});
}

export async function takeoverControl(robotId: string) {
  requireTakeoverPermission();

  return requestControlCommand(robotId, 'takeover-control', `/api/control/${robotId}/takeover`, {});
}

export async function changeMode(robotId: string, mode: ControlMode) {
  requireCanControl(robotId);

  return requestControlCommand(robotId, 'change-mode', `/api/control/${robotId}/mode`, { mode });
}

export async function sendManualCommand(robotId: string, command: ManualCommand) {
  requireCanControl(robotId);
  useControlStore.getState().recordManualInput(robotId);

  return requestControlCommand(robotId, 'manual-command', `/api/control/${robotId}/manual`, command);
}

export async function sendStopCommand(robotId: string) {
  requireCanControl(robotId);

  return requestControlCommand(robotId, 'stop', `/api/control/${robotId}/stop`, {});
}

export async function sendEmergencyStop(robotId: string) {
  const eligibility = canSendEmergencyStop(robotId);

  if (!eligibility.allowed) {
    throw new ControlPrecheckError(eligibility.reasons);
  }

  return requestControlCommand(robotId, 'emergency-stop', `/api/control/${robotId}/estop`, {});
}

export async function resetAfterEmergency(robotId: string) {
  requireControlPermission();

  return requestControlCommand(robotId, 'reset-after-emergency', `/api/control/${robotId}/reset-after-emergency`, {});
}

export async function sendMowerAttachmentCommand(robotId: string, action: MowerAttachmentAction) {
  requireCanControl(robotId);

  return requestControlCommand(robotId, 'mower-attachment', `/api/control/${robotId}/attachment`, { action });
}

function requireCanControl(robotId: string) {
  const eligibility = canControlRobot(robotId);

  if (!eligibility.allowed) {
    throw new ControlPrecheckError(eligibility.reasons);
  }
}

function requireControlPermission() {
  const { user, isAuthenticated } = useAuthStore.getState();

  if (!isAuthenticated || !user) {
    throw new ControlPrecheckError(['not-authenticated']);
  }

  if (!hasPermission(user.role, 'control:write')) {
    throw new ControlPrecheckError(['missing-control-permission']);
  }
}

function requireTakeoverPermission() {
  const { user, isAuthenticated } = useAuthStore.getState();

  if (!isAuthenticated || !user) {
    throw new ControlPrecheckError(['not-authenticated']);
  }

  if (!hasPermission(user.role, 'control:takeover')) {
    throw new ControlPrecheckError(['missing-takeover-permission']);
  }
}

async function requestControlCommand(
  robotId: string,
  commandType: ControlCommandType,
  path: string,
  body: ControlRequestBody,
): Promise<ControlCommandResult> {
  const requestedAt = new Date().toISOString();
  const pendingCommand = {
    id: `${commandType}-${requestedAt}`,
    type: commandType,
    requestedAt,
  };

  useControlStore.getState().setPendingCommand(robotId, pendingCommand);
  useControlStore.getState().setCommandError(robotId, null);

  try {
    if (import.meta.env.DEV) {
      applyMockControlResult(robotId, commandType);

      return {
        accepted: true,
        robotId,
        commandType,
        requestedAt,
        mock: true,
      };
    }

    return await httpClient.post<ControlCommandResult>(path, body);
  } catch (error) {
    useControlStore.getState().setCommandError(robotId, error instanceof Error ? error.message : 'Control command failed');
    throw error;
  } finally {
    useControlStore.getState().setPendingCommand(robotId, null);
  }
}

function applyMockControlResult(robotId: string, commandType: ControlCommandType) {
  const user = useAuthStore.getState().user;

  if (commandType === 'claim-control' || commandType === 'takeover-control') {
    useControlStore.getState().patchControlState(robotId, {
      lockState: 'held',
      controlOwner: user?.id ?? null,
    });
  }

  if (commandType === 'release-control') {
    useControlStore.getState().patchControlState(robotId, {
      lockState: 'none',
      controlOwner: null,
      manualActive: false,
    });
  }

  if (commandType === 'emergency-stop') {
    useControlStore.getState().patchControlState(robotId, {
      emergency: true,
      mode: 'emergency',
      manualActive: false,
    });
  }

  if (commandType === 'reset-after-emergency') {
    useControlStore.getState().patchControlState(robotId, {
      emergency: false,
      mode: 'idle',
      manualActive: false,
    });
  }

  if (commandType === 'stop') {
    useControlStore.getState().patchControlState(robotId, {
      manualActive: false,
      mode: 'idle',
    });
  }
}
