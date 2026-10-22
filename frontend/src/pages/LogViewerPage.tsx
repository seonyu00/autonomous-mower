import { useMemo, useState } from 'react';
import { getLogs } from '../features/logs/api';
import { LogTimeline } from '../features/logs/components/LogTimeline';
import { SnapshotViewer } from '../features/logs/components/SnapshotViewer';
import { mockLogEntries } from '../features/logs/mockLogs';
import type { LogEntry, LogSeverity } from '../features/logs/types';
import { useRobotStore } from '../features/robots/robotStore';
import { env } from '../shared/config/env';

export function LogViewerPage() {
  const robots = useRobotStore((state) => state.robots);
  const today = new Date().toISOString().slice(0, 10);
  const [robotId, setRobotId] = useState('all');
  const [severity, setSeverity] = useState<LogSeverity | 'all'>('all');
  const [text, setText] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [searchError, setSearchError] = useState('');
  const initialLogs = env.enableMockLogs ? mockLogEntries : [];
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [selectedLogId, setSelectedLogId] = useState(initialLogs[0]?.id ?? null);

  const selectedLog = useMemo(
    () => logs.find((log) => log.id === selectedLogId) ?? logs[0] ?? null,
    [logs, selectedLogId],
  );

  const handleSearch = async () => {
    setSearchError('');
    try {
      const result = await getLogs({ robotId, severity, text, from, to });
      setLogs(result);
      setSelectedLogId(result[0]?.id ?? null);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : '로그 검색에 실패했습니다.');
    }
  };

  return (
    <div className="logs-page">
      <section className="workspace-panel logs-search-panel" aria-label="로그 검색">
        <div className="panel-heading">
          <div>
            <h2>로그 뷰어</h2>
          </div>
          <span className="status-pill connected">{env.enableMockLogs ? '샘플 로그' : '실제 로그'}</span>
        </div>

        <div className="log-filters">
          <label>
            로봇
            <select value={robotId} onChange={(event) => setRobotId(event.target.value)}>
              <option value="all">전체 로봇</option>
              {robots.map((robot) => (
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
            <input value={text} placeholder="메시지, 이벤트 유형 또는 출처" onChange={(event) => setText(event.target.value)} />
          </label>

          <button className="primary-button" type="button" onClick={handleSearch}>
            검색
          </button>
        </div>
        {searchError && <p role="alert">{searchError}</p>}
      </section>

      <div className="logs-results">
        <section className="workspace-panel logs-timeline-panel" aria-labelledby="logs-timeline-title">
          <div className="panel-heading compact">
            <div>
              <h2 id="logs-timeline-title">이벤트 타임라인</h2>
            </div>
            <span className="status-pill connected">{logs.length}건</span>
          </div>
          <div className="logs-column-headings" aria-hidden="true">
            <span>시간</span><span>심각도</span><span>이벤트 · 메시지</span>
          </div>
          <div className="logs-list-scroll" role="region" aria-label="이벤트 목록" tabIndex={0}>
            <LogTimeline logs={logs} selectedLogId={selectedLog?.id ?? null} onSelectLog={setSelectedLogId} />
          </div>
        </section>

        <section className="workspace-panel logs-detail-panel" id="log-detail" aria-labelledby="log-detail-title">
          <div className="panel-heading compact">
            <h2 id="log-detail-title">선택한 로그 상세</h2>
          </div>
          {selectedLog ? (
            <>
              <strong className="logs-detail-event">{selectedLog.eventType}</strong>
              <p className="logs-detail-message">{selectedLog.message}</p>
              <dl className="logs-detail-fields">
                <div><dt>발생 시간</dt><dd>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(selectedLog.occurredAt))}</dd></div>
                <div><dt>로봇</dt><dd>{selectedLog.robotId}</dd></div>
                <div><dt>심각도</dt><dd>{{ info: '정보', warning: '경고', critical: '치명' }[selectedLog.severity]}</dd></div>
                <div><dt>발생 출처</dt><dd>{selectedLog.source}</dd></div>
              </dl>
              <h3>스냅샷</h3>
              <SnapshotViewer log={selectedLog} />
              <details className="logs-metadata" key={selectedLog.id}>
                <summary>로그 메타데이터 · 원본 JSON</summary>
                <pre className="payload-preview">{JSON.stringify(selectedLog, null, 2)}</pre>
              </details>
            </>
          ) : <p className="muted">목록에서 로그를 선택하면 상세 내용을 확인할 수 있습니다.</p>}
        </section>
      </div>
    </div>
  );
}
