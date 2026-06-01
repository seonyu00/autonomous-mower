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
            <p className="eyebrow">2단계</p>
            <h2>작업 이력</h2>
          </div>
          <span className="status-pill connected">샘플 데이터</span>
        </div>

        <div className="history-filters">
          <label>
            로봇
            <select value={robotId} onChange={(event) => setRobotId(event.target.value)}>
              {mockRobots.map((robot) => (
                <option key={robot.id} value={robot.id}>
                  {robot.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            시작일
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>

          <label>
            종료일
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>

          <button className="primary-button" type="button" onClick={handleSearch}>
            검색
          </button>
        </div>
      </section>

      <section className="workspace-panel history-map-panel">
        <HistoryMap selectedEntry={selectedEntry} />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">작업 기록</p>
            <h2>검색 결과</h2>
          </div>
          <span className="status-pill connected">{entries.length}건</span>
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
                {entry.distanceMeters} m | 커버리지 {entry.coveragePercent ?? '-'}%
              </small>
            </button>
          ))}
          {entries.length === 0 ? <p className="muted">선택한 조건에 맞는 작업 이력이 없습니다.</p> : null}
        </div>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">이벤트</p>
            <h2>이벤트 타임라인</h2>
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

  return `${formatter.format(new Date(startedAt))} - ${endedAt ? formatter.format(new Date(endedAt)) : '진행 중'}`;
}
