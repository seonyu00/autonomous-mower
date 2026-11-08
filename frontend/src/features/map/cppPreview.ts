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
  transitPath?: { lat: number; lon: number }[];
};

export type RoutePlanResult = { planId: string; sha256: string; preview: CppPreview };
export type RoutePreparation = { planId: string; sha256: string; reported: boolean; receivedAt: string | null };

export const CPP_PREVIEW_TIMEOUT_MS = 15000;
export const CPP_MAX_CELL_SIZE_M = 0.65;

const emptyPath: LngLat[] = [];

export function useCppPreview() {
  const robotId = useRobotStore((state) => state.selectedRobotId);
  const zone = useZoneStore((state) => robotId ? state.zonesByRobotId[robotId] : null);
  const version = useZoneStore((state) => robotId ? state.versionsByRobotId[robotId] : null);
  const editing = useZoneStore((state) => robotId ? Boolean(state.editingByRobotId[robotId] || state.editingByRobotId[robotId + '::travel']) : false);
  const [transitPath, setTransitPath] = useState<LngLat[]>([]);
  const [state, setState] = useState<{ path: LngLat[]; message: string; loading: boolean; planId: string | null; sha256: string | null }>({
    path: emptyPath, message: '', loading: false, planId: null, sha256: null,
  });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const preparationController = useRef<AbortController | null>(null);
  const [preparation, setPreparation] = useState({ message: '', loading: false });

  useEffect(() => {
    const invalidate = () => {
      generation.current += 1;
      const id = useRobotStore.getState().selectedRobotId;
      useZoneStore.setState(state => ({ reviewedPlans: id ? Object.fromEntries(Object.entries(state.reviewedPlans).filter(([key]) => key !== id)) : {} }));
      controller.current?.abort();
      preparationController.current?.abort();
      setPreparation({ message: '', loading: false });
      setTransitPath([]);
      setState({ path: emptyPath, message: '', loading: false, planId: null, sha256: null });
    };
    const unsubscribeRobot = useRobotStore.subscribe((next, previous) => {
      if (next.selectedRobotId !== previous.selectedRobotId) invalidate();
    });
    const unsubscribeZone = useZoneStore.subscribe((next, previous) => {
      const id = useRobotStore.getState().selectedRobotId;
      if (id && (next.zonesByRobotId[id] !== previous.zonesByRobotId[id]
        || next.versionsByRobotId[id] !== previous.versionsByRobotId[id]
        || next.editingByRobotId[id] !== previous.editingByRobotId[id]
        || next.editingByRobotId[id + '::travel'] !== previous.editingByRobotId[id + '::travel'])) invalidate();
    });
    const unsubscribeAuth = useAuthStore.subscribe((next, previous) => {
      if (next.sessionVersion !== previous.sessionVersion) invalidate();
    });
    return () => {
      generation.current += 1;
      controller.current?.abort();
      preparationController.current?.abort();
      unsubscribeRobot(); unsubscribeZone(); unsubscribeAuth();
    };
  }, []);

  const available = Boolean(robotId && zone && version != null && !editing && !isMockWorkZoneEnabled());
  const generate = async (cellSizeM: number, start?: { lat: number; lon: number }) => {
    if (!available || !Number.isFinite(cellSizeM) || cellSizeM < 0.2 || cellSizeM > CPP_MAX_CELL_SIZE_M) return;
    controller.current?.abort();
    preparationController.current?.abort();
    setPreparation({ message: '', loading: false });
      setTransitPath([]);
    const abort = new AbortController();
    controller.current = abort;
    const requestId = ++generation.current;
    useZoneStore.setState(state => ({ reviewedPlans: Object.fromEntries(Object.entries(state.reviewedPlans).filter(([key]) => key !== robotId)) }));
    setState({ path: emptyPath, message: 'CPP 예정 경로를 생성 중입니다.', loading: true, planId: null, sha256: null });
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
      const stored = await Promise.race([deadline, httpClient.post<RoutePlanResult>(
        `/api/robots/${encodeURIComponent(robotId!)}/work-zone/cpp-preview/plans`,
        { expectedVersion: version, cellSizeM, ...(start ? { start } : {}) }, { signal: abort.signal },
      )]);
      if (requestId !== generation.current) return;
      const result = stored.preview;
      if (result.robotId !== robotId || result.version !== version) {
        throw new Error('응답 구역이 현재 선택과 다릅니다.');
      }
      if (result.path.length >= 2) useZoneStore.setState(state => ({ reviewedPlans: { ...state.reviewedPlans, [robotId!]: { planId: stored.planId, version: result.version } } }));
      setTransitPath((result.transitPath ?? []).map(({ lat, lon }) => [lon, lat] as LngLat));
      const path: LngLat[] = result.path.map(({ lat, lon }) => [lon, lat]);
      setState({ path, loading: false, planId: path.length ? stored.planId : null, sha256: path.length ? stored.sha256 : null, message: path.length
        ? `예정 경로 ${path.length}점 · 저장 버전 ${result.version} · 격자 ${result.cellSizeM}m · 경로 ID ${stored.planId} · 번호가 증가하는 순서로 이동`
        : '생성된 경로점이 없습니다. 구역 크기와 격자 간격을 확인하세요.' });
    } catch (error) {
      if (requestId !== generation.current) return;
      setState({ path: emptyPath, loading: false, planId: null, sha256: null, message: error instanceof ApiError
        ? error.status === 408 ? '미리보기 요청이 15초 안에 완료되지 않았습니다. 다시 생성해 주세요.'
          : error.status === 422 ? '구역 크기에 비해 격자가 큽니다. 격자 간격을 줄이세요.'
          : error.status === 409 ? '작업 구역이 변경되었습니다. 최신 구역을 다시 불러오세요.'
          : error.status === 504 ? '경로 생성 제한 시간을 초과했습니다. 구역 크기와 격자 간격을 확인하세요.'
          : error.status === 400 ? '지원하지 않는 구역 또는 입력 크기입니다. 저장 구역과 격자 간격(0.2~0.65m)을 확인하세요.'
          : error.status === 503 ? 'CPP 서버가 준비되지 않았거나 다른 경로를 생성 중입니다. 잠시 후 다시 시도하세요.'
          : 'CPP 경로 생성에 실패했습니다. 서버 실행 환경과 연결 상태를 확인하세요.'  : '경로 생성에 실패했습니다. 연결 상태와 저장 구역을 확인하세요.' });
    } finally {
      clearDeadline();
      abort.signal.removeEventListener('abort', clearDeadline);
    }
  };
  const checkPreparation = async () => {
    if (!available || !robotId || !state.planId || !state.sha256) return;
    preparationController.current?.abort();
    const abort = new AbortController();
    preparationController.current = abort;
    const requestId = generation.current;
    setPreparation({ message: '파일 준비 보고를 확인 중입니다.', loading: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectOnAbort: (() => void) | undefined;
    try {
      const result = await Promise.race([
        httpClient.get<RoutePreparation>(`/api/robots/${encodeURIComponent(robotId)}/work-zone/cpp-preview/plans/${state.planId}/preparation`, { signal: abort.signal }),
        new Promise<never>((_, reject) => {
          rejectOnAbort = () => reject(new Error('aborted'));
          abort.signal.addEventListener('abort', rejectOnAbort, { once: true });
          timer = setTimeout(() => { reject(new Error('timeout')); abort.abort(); }, CPP_PREVIEW_TIMEOUT_MS);
        }),
      ]);
      if (requestId !== generation.current || preparationController.current !== abort) return;
      if (result.planId !== state.planId || result.sha256 !== state.sha256 || typeof result.reported !== 'boolean'
        || (result.reported && (!result.receivedAt || !Number.isFinite(Date.parse(result.receivedAt))))) throw new Error('mismatch');
      const received = result.receivedAt ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium',
      }).format(new Date(result.receivedAt)) : '';
      setPreparation({ loading: false, message: result.reported
        ? `파일 준비 보고 수신 · ${received} (한국 시간)` : '이 경로의 파일 준비 보고가 아직 없습니다.' });
    } catch {
      if (requestId !== generation.current || preparationController.current !== abort) return;
      setPreparation({ loading: false, message: '파일 준비 보고를 확인하지 못했습니다. 구역 버전과 연결 상태를 확인하고 다시 조회하세요.' });
    } finally {
      clearTimeout(timer);
      if (rejectOnAbort) abort.signal.removeEventListener('abort', rejectOnAbort);
    }
  };
  return { ...state, path: available ? state.path : emptyPath, planId: available ? state.planId : null, sha256: available ? state.sha256 : null,
    preparation, checkPreparation, transitPath: available ? transitPath : [], available, generate };
}

// 긴 경로는 표식만 간추린다. 선에는 모든 경로점을 전달하고 번호는 원래 순서를 유지한다.
export function previewMarkers(path: LngLat[]) {
  const step = Math.max(1, Math.ceil(path.length / 24));
  return path.flatMap((position, index) => index === 0 || index === path.length - 1 || index % step === 0
    ? [{ position, index, label: path.length === 1 ? '시작·끝 1' : index === 0 ? '시작 1'
      : index === path.length - 1 ? `끝 ${index + 1}` : `${index + 1}` }]
    : []);
}
