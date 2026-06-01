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
            <p className="eyebrow">2단계</p>
            <h2>로그 뷰어</h2>
          </div>
          <span className="status-pill connected">샘플 로그</span>
        </div>

        <div className="log-filters">
          <label>
            로봇
            <select value={robotId} onChange={(event) => setRobotId(event.target.value)}>
              <option value="all">전체 로봇</option>
              {mockRobots.map((robot) => (
                <option key={robot.id} value={robot.id}>
                  {robot.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            심각도
            <select value={severity} onChange={(event) => setSeverity(event.target.value as LogSeverity | 'all')}>
              <option value="all">전체</option>
              <option value="info">정보</option>
              <option value="warning">경고</option>
              <option value="critical">치명</option>
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

          <label className="log-search-field">
            검색어
            <input value={text} placeholder="메시지 또는 이벤트 유형" onChange={(event) => setText(event.target.value)} />
          </label>

          <button className="primary-button" type="button" onClick={handleSearch}>
            검색
          </button>
        </div>
      </section>

      <section className="workspace-panel logs-timeline-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">타임라인</p>
            <h2>이벤트</h2>
          </div>
          <span className="status-pill connected">{logs.length}건</span>
        </div>
        <LogTimeline logs={logs} selectedLogId={selectedLog?.id ?? null} onSelectLog={setSelectedLogId} />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">스냅샷</p>
            <h2>스냅샷 뷰어</h2>
          </div>
        </div>
        <SnapshotViewer log={selectedLog} />
      </section>

      <section className="workspace-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">상세</p>
            <h2>로그 메타데이터</h2>
          </div>
        </div>
        <pre className="payload-preview">{selectedLog ? JSON.stringify(selectedLog, null, 2) : '선택된 로그가 없습니다.'}</pre>
      </section>
    </div>
  );
}
