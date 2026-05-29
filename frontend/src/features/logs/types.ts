export type LogSeverity = 'info' | 'warning' | 'critical';

export type LogEntry = {
  id: string;
  robotId: string;
  severity: LogSeverity;
  message: string;
  occurredAt: string;
};
