import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../../shared/api/httpClient';
import { ApiError } from '../../shared/api/errors';
import { useRobotStore } from '../robots/robotStore';
import { useZoneStore } from './zoneStore';
import { CPP_PREVIEW_TIMEOUT_MS, previewMarkers, useCppPreview, type CppPreview } from './cppPreview';
import type { PolygonGeometry } from './geojson';

vi.mock('./zoneApi', () => ({ isMockWorkZoneEnabled: () => false }));
vi.mock('../../shared/api/httpClient', () => ({ httpClient: { post: vi.fn() } }));
const zone: PolygonGeometry = { type: 'Polygon', coordinates: [[[127, 37], [127.001, 37], [127, 37.001], [127, 37]]] };
const response: CppPreview = { robotId: 'R1', zoneId: 1, version: 2, cellSizeM: 1,
  rows: 20, columns: 20, origin: { lat: 37, lon: 127 },
  path: [{ lat: 37.0001, lon: 127.0002 }, { lat: 37.0002, lon: 127.0003 }] };

describe('CPP 미리보기', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useRobotStore.setState({ selectedRobotId: 'R1' });
    useZoneStore.setState({ zonesByRobotId: { R1: zone }, versionsByRobotId: { R1: 2 }, editingByRobotId: {} });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('명시적 요청에 저장 버전을 보내고 위경도를 GeoJSON 순서로 바꾼다', async () => {
    vi.mocked(httpClient.post).mockResolvedValue(response);
    const { result } = renderHook(useCppPreview);
    expect(httpClient.post).not.toHaveBeenCalled();
    await act(() => result.current.generate(1));
    expect(httpClient.post).toHaveBeenCalledWith('/api/robots/R1/work-zone/cpp-preview',
      { expectedVersion: 2, cellSizeM: 1 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(result.current.path).toEqual([[127.0002, 37.0001], [127.0003, 37.0002]]);
  });

  it.each(['robot', 'zone', 'editing', 'version'])('%s 변경 후 늦은 응답을 버린다', async (change) => {
    let resolve!: (value: CppPreview) => void;
    vi.mocked(httpClient.post).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(useCppPreview);
    let request!: Promise<void>;
    act(() => { request = result.current.generate(1); });
    expect(result.current.loading).toBe(true);
    act(() => {
      if (change === 'robot') {
        useRobotStore.setState({ selectedRobotId: 'R2' });
        useRobotStore.setState({ selectedRobotId: 'R1' });
      } else if (change === 'zone') useZoneStore.getState().setZone('R1', { ...zone }, 2);
      else if (change === 'editing') useZoneStore.getState().startEditing('R1');
      else useZoneStore.setState({ versionsByRobotId: { R1: 3 } });
    });
    await act(async () => { resolve(response); await request; });
    expect(result.current.path).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('다시 생성한 요청이 먼저 완료되면 이전 응답이 덮어쓰지 않는다', async () => {
    let resolve!: (value: CppPreview) => void;
    vi.mocked(httpClient.post).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ ...response, path: [] });
    const { result } = renderHook(useCppPreview);
    let first!: Promise<void>;
    act(() => { first = result.current.generate(1); });
    await act(() => result.current.generate(1));
    await act(async () => { resolve(response); await first; });
    expect(result.current.message).toContain('경로점이 없습니다');
  });

  it('끝나지 않는 요청을 15초 후 종료하고 재시도 결과를 늦은 응답으로 덮지 않는다', async () => {
    vi.useFakeTimers();
    let resolve!: (value: CppPreview) => void;
    vi.mocked(httpClient.post).mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockResolvedValueOnce({ ...response, path: [] });
    const { result } = renderHook(useCppPreview);
    let request!: Promise<void>;
    act(() => { request = result.current.generate(1); });
    const signal = vi.mocked(httpClient.post).mock.calls[0][2]?.signal;
    await act(async () => { await vi.advanceTimersByTimeAsync(CPP_PREVIEW_TIMEOUT_MS); await request; });
    expect(signal?.aborted).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.message).toContain('15초');
    expect(vi.getTimerCount()).toBe(0);
    await act(() => result.current.generate(1));
    await act(async () => { resolve(response); });
    expect(result.current.path).toEqual([]);
    expect(result.current.message).toContain('경로점이 없습니다');
  });

  it('성공·구역 변경·해제 시 제한 타이머를 정리한다', async () => {
    vi.useFakeTimers();
    vi.mocked(httpClient.post).mockResolvedValueOnce(response).mockImplementation(() => new Promise(() => {}));
    const { result, unmount } = renderHook(useCppPreview);
    await act(() => result.current.generate(1));
    expect(vi.getTimerCount()).toBe(0);
    act(() => { void result.current.generate(1); });
    expect(vi.getTimerCount()).toBe(1);
    act(() => useZoneStore.getState().setZone('R1', { ...zone }, 2));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(CPP_PREVIEW_TIMEOUT_MS); });
    expect(result.current.message).toBe('');
    act(() => { void result.current.generate(1); });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('격자가 구역보다 크면 간격을 줄이도록 안내한다', async () => {
    vi.mocked(httpClient.post).mockRejectedValue(new ApiError('Unprocessable Entity', 'validation', 422));
    const { result } = renderHook(useCppPreview);
    await act(() => result.current.generate(5));
    expect(result.current.message).toContain('격자 간격을 줄이세요');
    expect(result.current.loading).toBe(false);
  });

  it('빈 결과·실패·시간 초과를 한국어로 안내한다', async () => {
    const { result } = renderHook(useCppPreview);
    vi.mocked(httpClient.post).mockResolvedValue({ ...response, path: [] });
    await act(() => result.current.generate(1));
    expect(result.current.message).toContain('경로점이 없습니다');
    vi.mocked(httpClient.post).mockRejectedValue(new ApiError('Gateway Timeout', 'server', 504));
    await act(() => result.current.generate(1));
    expect(result.current.message).toContain('제한 시간을 초과');
    vi.mocked(httpClient.post).mockRejectedValue(new Error('failed'));
    await act(() => result.current.generate(1));
    expect(result.current.message).toContain('실패');
    expect(result.current.path).toEqual([]);
  });

  it('완료된 결과도 구역 변경 즉시 제거하고 시작·끝 번호를 보존한다', async () => {
    vi.mocked(httpClient.post).mockResolvedValue(response);
    const { result } = renderHook(useCppPreview);
    await act(() => result.current.generate(1));
    expect(previewMarkers(result.current.path).map((point) => point.label)).toEqual(['시작 1', '끝 2']);
    act(() => useZoneStore.getState().setZone('R1', { ...zone }, 3));
    expect(result.current.path).toEqual([]);
  });
});
