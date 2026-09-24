import { useEffect, useRef, useState } from 'react';
import { httpClient } from '../../shared/api/httpClient';
import { ApiError } from '../../shared/api/errors';
import { useAuthStore } from '../auth/authStore';
import { useRobotStore } from '../robots/robotStore';
import { useZoneStore } from './zoneStore';
import { isMockWorkZoneEnabled } from './zoneApi';
import type { LngLat } from './geojson';

export type CppPreview = {
  robotId: string;
  zoneId: number;
  version: number;
  cellSizeM: number;
  rows: number;
  columns: number;
  origin: { lat: number; lon: number };
  path: { lat: number; lon: number }[];
};

export const CPP_PREVIEW_TIMEOUT_MS = 15000;

const emptyPath: LngLat[] = [];

export function useCppPreview() {
  const robotId = useRobotStore((state) => state.selectedRobotId);
  const zone = useZoneStore((state) => robotId ? state.zonesByRobotId[robotId] : null);
  const version = useZoneStore((state) => robotId ? state.versionsByRobotId[robotId] : null);
  const editing = useZoneStore((state) => robotId ? state.editingByRobotId[robotId] : false);
  const [state, setState] = useState<{ path: LngLat[]; message: string; loading: boolean }>({
    path: emptyPath, message: '', loading: false,
  });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const invalidate = () => {
      generation.current += 1;
      controller.current?.abort();
      setState({ path: emptyPath, message: '', loading: false });
    };
    const unsubscribeRobot = useRobotStore.subscribe((next, previous) => {
      if (next.selectedRobotId !== previous.selectedRobotId) invalidate();
    });
    const unsubscribeZone = useZoneStore.subscribe((next, previous) => {
      const id = useRobotStore.getState().selectedRobotId;
      if (id && (next.zonesByRobotId[id] !== previous.zonesByRobotId[id]
        || next.versionsByRobotId[id] !== previous.versionsByRobotId[id]
        || next.editingByRobotId[id] !== previous.editingByRobotId[id])) invalidate();
    });
    const unsubscribeAuth = useAuthStore.subscribe((next, previous) => {
      if (next.sessionVersion !== previous.sessionVersion) invalidate();
    });
    return () => {
      generation.current += 1;
      controller.current?.abort();
      unsubscribeRobot(); unsubscribeZone(); unsubscribeAuth();
    };
  }, []);

  const available = Boolean(robotId && zone && version != null && !editing && !isMockWorkZoneEnabled());
  const generate = async (cellSizeM: number) => {
    if (!available || !Number.isFinite(cellSizeM) || cellSizeM < 0.2 || cellSizeM > 5) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const requestId = ++generation.current;
    setState({ path: emptyPath, message: 'CPP 예정 경로를 생성 중입니다.', loading: true });
    let timeout: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new ApiError('미리보기 요청 시간이 초과되었습니다.', 'network', 408));
        abort.abort();
      }, CPP_PREVIEW_TIMEOUT_MS);
    });
    const clearDeadline = () => clearTimeout(timeout);
    abort.signal.addEventListener('abort', clearDeadline, { once: true });
    try {
      // 취소 신호를 무시하는 응답도 제한 시간이 지난 화면을 덮어쓰지 못하게 한다.
      const result = await Promise.race([deadline, httpClient.post<CppPreview>(
        `/api/robots/${encodeURIComponent(robotId!)}/work-zone/cpp-preview`,
        { expectedVersion: version, cellSizeM }, { signal: abort.signal },
      )]);
      if (requestId !== generation.current) return;
      if (result.robotId !== robotId || result.version !== version) {
        throw new Error('응답 구역이 현재 선택과 다릅니다.');
      }
      const path: LngLat[] = result.path.map(({ lat, lon }) => [lon, lat]);
      setState({ path, loading: false, message: path.length
        ? `예정 경로 ${path.length}점 · 저장 버전 ${result.version} · 격자 ${result.cellSizeM}m · 번호가 증가하는 순서로 이동`
        : '생성된 경로점이 없습니다. 구역 크기와 격자 간격을 확인하세요.' });
    } catch (error) {
      if (requestId !== generation.current) return;
      setState({ path: emptyPath, loading: false, message: error instanceof ApiError
        ? error.status === 408 ? '미리보기 요청이 15초 안에 완료되지 않았습니다. 다시 생성해 주세요.'
          : error.status === 422 ? '구역 크기에 비해 격자가 큽니다. 격자 간격을 줄이세요.'
          : error.status === 409 ? '작업 구역이 변경되었습니다. 최신 구역을 다시 불러오세요.'
          : error.status === 504 ? '경로 생성 제한 시간을 초과했습니다. 구역 크기와 격자 간격을 확인하세요.'
          : error.status === 400 ? '지원하지 않는 구역 또는 입력 크기입니다. 구멍 없는 구역과 격자 간격(0.2~5m)을 확인하세요.'
          : error.status === 503 ? 'CPP 서버가 준비되지 않았거나 다른 경로를 생성 중입니다. 잠시 후 다시 시도하세요.'
          : 'CPP 경로 생성에 실패했습니다. 서버 실행 환경과 연결 상태를 확인하세요.'  : '경로 생성에 실패했습니다. 연결 상태와 저장 구역을 확인하세요.' });
    } finally {
      clearDeadline();
      abort.signal.removeEventListener('abort', clearDeadline);
    }
  };
  return { ...state, path: available ? state.path : emptyPath, available, generate };
}

// 긴 경로는 표식만 간추린다. 선에는 모든 경로점을 전달하고 번호는 원래 순서를 유지한다.
export function previewMarkers(path: LngLat[]) {
  const step = Math.max(1, Math.ceil(path.length / 24));
  return path.flatMap((position, index) => index === 0 || index === path.length - 1 || index % step === 0
    ? [{ position, index, label: path.length === 1 ? '시작·끝 1' : index === 0 ? '시작 1'
      : index === path.length - 1 ? `끝 ${index + 1}` : `${index + 1}` }]
    : []);
}
