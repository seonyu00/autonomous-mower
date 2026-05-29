export type ControlMode = 'idle' | 'manual' | 'autonomous' | 'emergency' | 'home';
export type ControlLockState = 'none' | 'requesting' | 'held' | 'held-by-other' | 'expired' | 'revoked';

export type ControlCommandType =
  | 'claim-control'
  | 'release-control'
  | 'takeover-control'
  | 'change-mode'
  | 'manual-command'
  | 'stop'
  | 'emergency-stop'
  | 'reset-after-emergency'
  | 'mower-attachment';

export type MowerAttachmentAction = 'blade-start' | 'blade-stop' | 'raise' | 'lower';

export type ManualDirection = 'forward' | 'reverse' | 'left' | 'right' | 'rotate-left' | 'rotate-right' | 'stop';

export type ManualCommand = {
  action: 'manual';
  robotId: string;
  direction: ManualDirection;
  speed: number;
};

export type StopCommand = {
  action: 'stop';
  robotId: string;
  direction: 'stop';
  speed: 0;
};

export type PendingCommand = {
  id: string;
  type: ControlCommandType;
  requestedAt: string;
};

export type ControlState = {
  robotId: string;
  lockState: ControlLockState;
  mode: ControlMode;
  emergency: boolean;
  manualActive: boolean;
  lastInputAt: string | null;
  pendingCommand: PendingCommand | null;
  commandError: string | null;
  controlOwner: string | null;
  lastCommandPayload: ManualCommand | StopCommand | null;
};

export type ControlCommandResult = {
  accepted: boolean;
  robotId: string;
  commandType: ControlCommandType;
  requestedAt: string;
  mock: boolean;
};
