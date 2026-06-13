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
  idempotencyKey?: string;
  lockVersion?: number;
  clientSentAt?: string;
};

export type ModeCommand = {
  action: 'change-mode';
  robotId: string;
  mode: ControlMode;
  idempotencyKey?: string;
  lockVersion?: number;
};

export type MowerAttachmentCommand = {
  action: 'mower-attachment';
  robotId: string;
  attachmentAction: MowerAttachmentAction;
  idempotencyKey?: string;
  lockVersion?: number;
};

export type StopCommand = {
  action: 'stop';
  robotId: string;
  direction: 'stop';
  speed: 0;
  idempotencyKey?: string;
  lockVersion?: number;
  reason?: string;
};

export type ControlCommandPayload = ManualCommand | ModeCommand | MowerAttachmentCommand | StopCommand;

export type PendingCommand = {
  id: string;
  type: ControlCommandType;
  requestedAt: string;
};

export type ControlLockSnapshot = {
  robotId: string;
  lockState: ControlLockState;
  controlOwner: string | null;
  controlOwnerName: string | null;
  mode: ControlMode;
  emergency: boolean;
  lockVersion: number;
  expiresAt: string | null;
  reason: string | null;
  updatedAt: string;
};

export type ControlCommandEvent = {
  robotId: string;
  commandId: string;
  commandType: string;
  status: 'accepted' | 'rejected' | 'sent-to-edge' | 'edge-ack' | 'edge-timeout' | 'failed';
  reason: string | null;
  requestedBy: string;
  serverTimestamp: string;
  edgeAckAt: string | null;
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
  lockVersion: number;
  expiresAt: string | null;
  lastCommandEvent: ControlCommandEvent | null;
  lastCommandPayload: ControlCommandPayload | null;
};

export type ControlCommandResult = {
  accepted: boolean;
  robotId: string;
  commandId?: string;
  commandType: ControlCommandType;
  requestedAt: string;
  acceptedAt?: string;
  lockState?: ControlLockState;
  controlOwner?: string | null;
  mode?: ControlMode;
  emergency?: boolean;
  mock?: boolean;
};
