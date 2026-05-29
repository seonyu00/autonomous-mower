import type { Feature, LineString, Point } from 'geojson';

export type HistoryEventSeverity = 'info' | 'warning' | 'critical';

export type HistoryEvent = {
  id: string;
  robotId: string;
  occurredAt: string;
  severity: HistoryEventSeverity;
  type: 'job-started' | 'obstacle-detected' | 'communication-lost' | 'job-paused' | 'job-completed';
  message: string;
  location?: Feature<Point>;
};

export type HistoryEntry = {
  id: string;
  robotId: string;
  startedAt: string;
  endedAt?: string;
  route: Feature<LineString>;
  events: HistoryEvent[];
  distanceMeters: number;
  coveragePercent?: number;
};

export type HistoryQuery = {
  robotId: string;
  from: string;
  to: string;
};
