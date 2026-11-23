import { useEffect, useState } from 'react';
import { httpClient } from '../../shared/api/httpClient';
import { ApiError } from '../../shared/api/errors';
import { ReplayPlayer } from './MissionReplayPage';
import { HistoryMap } from './components/HistoryMap';
import { readMissionReplay, type MissionReplay } from './missionReplay';
import type { HistoryEntry } from './types';
import './missionReplay.css';

export function StoredReplay({ id, robotId, selectedEntry }: {
  id: string | null; robotId: string; selectedEntry: HistoryEntry | null;
}) {
  const [result, setResult] = useState<{ id: string | null; mission?: MissionReplay; message?: string }>({ id });
  if (result.id !== id) setResult({ id });
  useEffect(() => {
    if (!id) return;
    const replayId = id;
    const controller = new AbortController();
    async function load() {
      try {
        const file = await httpClient.getBlob(
          `/api/history/runs/${encodeURIComponent(replayId.slice(4))}/replay?robotId=${encodeURIComponent(robotId)}`,
          { signal: controller.signal, headers: { Accept: 'application/octet-stream' } });
        const data = await readMissionReplay(file, controller.signal);
        if (!controller.signal.aborted) setResult({ id: replayId, mission: data });
      } catch (cause) {
        if (!controller.signal.aborted) setResult({ id: replayId, message: cause instanceof ApiError && cause.status === 404
          ? '이 작업에 등록된 주행 기록이 없습니다.'
          : '주행 기록을 불러오지 못했습니다. 다시 검색하거나 다른 작업을 선택해 주세요.' });
      }
    }
    void load();
    return () => controller.abort();
  }, [id, robotId]);
  const mission = result.id === id ? result.mission ?? null : null;
  return <>
    <ReplayPlayer mission={mission}
      renderMap={(replay, frame) => <HistoryMap selectedEntry={selectedEntry} replay={replay} frame={frame} />} />
    {id && !mission && <p className="history-replay-status" role="status">
      {result.message ?? '서버에서 주행 기록을 불러오는 중입니다.'}
    </p>}
  </>;
}
