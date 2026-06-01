import type { LogEntry } from '../types';

type SnapshotViewerProps = {
  log: LogEntry | null;
};

export function SnapshotViewer({ log }: SnapshotViewerProps) {
  if (!log) {
    return (
      <div className="snapshot-placeholder">
        <strong>선택된 로그가 없습니다.</strong>
        <span>타임라인에서 로그를 선택하면 스냅샷 메타데이터를 확인할 수 있습니다.</span>
      </div>
    );
  }

  if (!log.snapshot) {
    return (
      <div className="snapshot-placeholder">
        <strong>스냅샷 없음</strong>
        <span>이 로그에는 장애물 또는 오류 JPEG 참조가 없습니다.</span>
      </div>
    );
  }

  return (
    <div className="snapshot-placeholder has-snapshot">
      <strong>스냅샷 미리보기</strong>
      <span>{log.snapshot.id}</span>
      <span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(log.snapshot.capturedAt))}</span>
      <small>로그 API에서 스냅샷 URL을 제공하면 JPEG 미리보기를 연결합니다.</small>
    </div>
  );
}
