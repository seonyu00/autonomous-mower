import { useMemo, useState } from 'react';
import { getHistory } from '../features/history/api';
import { HistoryMap } from '../features/history/components/HistoryMap';
import { HistoryTimeline } from '../features/history/components/HistoryTimeline';
import { mockHistoryEntries } from '../features/history/mockHistory';
import type { HistoryEntry } from '../features/history/types';
import { mockRobots } from '../features/robots/mockRobots';

export function HistoryPage() {
  const [robotId, setRobotId] = useState(mockRobots[0]?.id ?? '');
  const [from, setFrom] = useState('2026-05-28');
  const [to, setTo] = useState('2026-05-29');
  const [entries, setEntries] = useState<HistoryEntry[]>(() =>
    mockHistoryEntries.filter((entry) => entry.robotId === (mockRobots[0]?.id ?? '')),
  );
  const [selectedEntryId, setSelectedEntryId] = useState(entries[0]?.id ?? null);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null,
    [entries, selectedEntryId],
  );

  const handleSearch = async () => {
    const result = await getHistory({ robotId, from, to });
    setEntries(result);
    setSelectedEntryId(result[0]?.id ?? null);
  };

  return (
    <div className="history-page">
      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Phase 2</p>
            <h2>History</h2>
          </div>
          <span className="status-pill connected">mock data</span>
        </div>

        <div className="history-filters">
          <label>
            Robot
            <select value={robotId} onChange={(event) => setRobotId(event.target.value)}>
              {mockRobots.map((robot) => (
                <option key={robot.id} value={robot.id}>
                  {robot.id}
                </option>
              ))}
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

          <button className="primary-button" type="button" onClick={handleSearch}>
            Search
          </button>
        </div>
      </section>

      <section className="workspace-panel history-map-panel">
        <HistoryMap selectedEntry={selectedEntry} />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Runs</p>
            <h2>Search Results</h2>
          </div>
          <span className="status-pill connected">{entries.length} runs</span>
        </div>
        <div className="history-result-list">
          {entries.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === selectedEntry?.id ? 'history-result selected' : 'history-result'}
              type="button"
              onClick={() => setSelectedEntryId(entry.id)}
            >
              <strong>{entry.robotId}</strong>
              <span>{formatRange(entry.startedAt, entry.endedAt)}</span>
              <small>
                {entry.distanceMeters} m | {entry.coveragePercent ?? '-'}% coverage
              </small>
            </button>
          ))}
          {entries.length === 0 ? <p className="muted">No mock history data matches the selected filters.</p> : null}
        </div>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Placeholder</p>
            <h2>Event Timeline</h2>
          </div>
        </div>
        <HistoryTimeline entry={selectedEntry} />
      </section>
    </div>
  );
}

function formatRange(startedAt: string, endedAt?: string) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return `${formatter.format(new Date(startedAt))} - ${endedAt ? formatter.format(new Date(endedAt)) : 'running'}`;
}
