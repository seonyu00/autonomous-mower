export type LogSeverity = 'info' | 'warning' | 'critical';
export type LogEventType =
  | 'obstacle-detected'
  | 'communication-lost'
  | 'estop'
  | 'sensor-fault'
  | 'controller-error'
  | 'job-event';

export type SnapshotRef = {
  id: string;
  capturedAt: string;
  contentType: 'image/jpeg';
  url?: string;
};

export type LogEntry = {
  id: string;
  robotId: string;
  severity: LogSeverity;
  eventType: LogEventType;
  message: string;
  occurredAt: string;
  source: 'edge' | 'server' | 'dashboard';
  snapshot?: SnapshotRef;
  metadata?: Record<string, string | number | boolean>;
};

export type LogQuery = {
  robotId: string;
  severity: LogSeverity | 'all';
  text: string;
  from: string;
  to: string;
};
