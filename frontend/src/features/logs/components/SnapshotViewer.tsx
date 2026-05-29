import type { LogEntry } from '../types';

type SnapshotViewerProps = {
  log: LogEntry | null;
};

export function SnapshotViewer({ log }: SnapshotViewerProps) {
  if (!log) {
    return (
      <div className="snapshot-placeholder">
        <strong>No log selected</strong>
        <span>Select a timeline entry to inspect snapshot metadata.</span>
      </div>
    );
  }

  if (!log.snapshot) {
    return (
      <div className="snapshot-placeholder">
        <strong>No snapshot</strong>
        <span>This log does not include an obstacle or error JPEG reference.</span>
      </div>
    );
  }

  return (
    <div className="snapshot-placeholder has-snapshot">
      <strong>Snapshot Viewer Placeholder</strong>
      <span>{log.snapshot.id}</span>
      <span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(log.snapshot.capturedAt))}</span>
      <small>JPEG rendering will be connected when the logs API exposes snapshot URLs.</small>
    </div>
  );
}
