import { useMemo, useState } from 'react';
import { getLogs } from '../features/logs/api';
import { LogTimeline } from '../features/logs/components/LogTimeline';
import { SnapshotViewer } from '../features/logs/components/SnapshotViewer';
import { mockLogEntries } from '../features/logs/mockLogs';
import type { LogEntry, LogSeverity } from '../features/logs/types';
import { mockRobots } from '../features/robots/mockRobots';

export function LogViewerPage() {
  const [robotId, setRobotId] = useState('all');
  const [severity, setSeverity] = useState<LogSeverity | 'all'>('all');
  const [text, setText] = useState('');
  const [from, setFrom] = useState('2026-05-28');
  const [to, setTo] = useState('2026-05-29');
  const [logs, setLogs] = useState<LogEntry[]>(mockLogEntries);
  const [selectedLogId, setSelectedLogId] = useState(mockLogEntries[0]?.id ?? null);

  const selectedLog = useMemo(
    () => logs.find((log) => log.id === selectedLogId) ?? logs[0] ?? null,
    [logs, selectedLogId],
  );

  const handleSearch = async () => {
    const result = await getLogs({ robotId, severity, text, from, to });
    setLogs(result);
    setSelectedLogId(result[0]?.id ?? null);
  };

  return (
    <div className="logs-page">
      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Phase 2</p>
            <h2>Log Viewer</h2>
          </div>
          <span className="status-pill connected">mock logs</span>
        </div>

        <div className="log-filters">
          <label>
            Robot
            <select value={robotId} onChange={(event) => setRobotId(event.target.value)}>
              <option value="all">All robots</option>
              {mockRobots.map((robot) => (
                <option key={robot.id} value={robot.id}>
                  {robot.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            Severity
            <select value={severity} onChange={(event) => setSeverity(event.target.value as LogSeverity | 'all')}>
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label>
            From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>

          <label>
            To
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>

          <label className="log-search-field">
            Search
            <input value={text} placeholder="message or event type" onChange={(event) => setText(event.target.value)} />
          </label>

          <button className="primary-button" type="button" onClick={handleSearch}>
            Search
          </button>
        </div>
      </section>

      <section className="workspace-panel logs-timeline-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2>Events</h2>
          </div>
          <span className="status-pill connected">{logs.length} logs</span>
        </div>
        <LogTimeline logs={logs} selectedLogId={selectedLog?.id ?? null} onSelectLog={setSelectedLogId} />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Placeholder</p>
            <h2>Snapshot Viewer</h2>
          </div>
        </div>
        <SnapshotViewer log={selectedLog} />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Details</p>
            <h2>Log Metadata</h2>
          </div>
        </div>
        <pre className="payload-preview">{selectedLog ? JSON.stringify(selectedLog, null, 2) : 'No log selected'}</pre>
      </section>
    </div>
  );
}
