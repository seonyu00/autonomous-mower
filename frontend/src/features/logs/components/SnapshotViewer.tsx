import { useEffect, useState } from 'react';
import { getSnapshotBlob } from '../api';
import type { LogEntry } from '../types';

type SnapshotViewerProps = {
  log: LogEntry | null;
};

export function SnapshotViewer({ log }: SnapshotViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = log?.snapshot;

  useEffect(() => {
    if (!snapshot?.url) {
      setImageUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setImageUrl(null);
    setLoading(true);
    setError(null);

    void getSnapshotBlob(snapshot.url)
      .then((blob) => {
        if (!active) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : '스냅샷을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [snapshot?.url]);

  if (!log) {
    return (
      <div className="snapshot-placeholder">
        <strong>선택된 로그가 없습니다.</strong>
        <span>타임라인에서 로그를 선택하면 스냅샷을 확인할 수 있습니다.</span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="snapshot-placeholder">
        <strong>스냅샷 없음</strong>
        <span>이 로그에는 JPEG 스냅샷 참조가 없습니다.</span>
      </div>
    );
  }

  return (
    <div className="snapshot-placeholder has-snapshot">
      <strong>스냅샷 미리보기</strong>
      {loading ? <span>이미지를 불러오는 중입니다.</span> : null}
      {error ? <span className="warning-line">{error}</span> : null}
      {imageUrl ? <img className="snapshot-image" src={imageUrl} alt={`${log.robotId} 스냅샷`} /> : null}
      <span>{snapshot.id}</span>
      <span>
        {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'medium' }).format(
          new Date(snapshot.capturedAt),
        )}
      </span>
      {!snapshot.url ? <small>스냅샷 이미지 URL이 기록되지 않았습니다.</small> : null}
    </div>
  );
}
