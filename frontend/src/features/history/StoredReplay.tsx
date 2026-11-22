import { useEffect, useState } from 'react';
import { httpClient } from '../../shared/api/httpClient';
import { ApiError } from '../../shared/api/errors';
import { ReplayPlayer } from './MissionReplayPage';
import { readMissionReplay, type MissionReplay } from './missionReplay';
import './missionReplay.css';

export function StoredReplay({ id, robotId }: { id: string; robotId: string }) {
  const [mission, setMission] = useState<MissionReplay | null>(null);
  const [message, setMessage] = useState('서버에서 주행 기록을 불러오는 중입니다.');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const file = await httpClient.getBlob(
          `/api/history/runs/${encodeURIComponent(id.slice(4))}/replay?robotId=${encodeURIComponent(robotId)}`,
          { signal: controller.signal, headers: { Accept: 'application/octet-stream' } });
        const data = await readMissionReplay(file, controller.signal);
        if (!controller.signal.aborted) setMission(data);
      } catch (cause) {
        if (!controller.signal.aborted) setMessage(cause instanceof ApiError && cause.status === 404
          ? '이 작업에 등록된 주행 기록이 없습니다.'
          : '주행 기록을 불러오지 못했습니다. 다시 검색하거나 다른 작업을 선택해 주세요.');
      }
    }
    void load();
    return () => controller.abort();
  }, [id, robotId]);
  return <section className="workspace-panel mission-replay" aria-label="선택한 작업의 CPP 주행 기록">
    <h2>CPP 주행 기록</h2>
    {mission ? <ReplayPlayer mission={mission} /> : <p role="status">{message}</p>}
  </section>;
}
