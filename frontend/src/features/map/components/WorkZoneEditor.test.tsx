import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores } from '../../../test/testStores';
import { useZoneStore } from '../zoneStore';
import { WorkZoneEditor } from './WorkZoneEditor';
import { ApiError } from '../../../shared/api/errors';

const getWorkZone = vi.fn();
const saveWorkZone = vi.fn();
const isMockWorkZoneEnabled = vi.fn(() => false);

vi.mock('../zoneApi', () => ({
  getWorkZone: (...args: unknown[]) => getWorkZone(...args),
  saveWorkZone: (...args: unknown[]) => saveWorkZone(...args),
  isMockWorkZoneEnabled: () => isMockWorkZoneEnabled(),
}));

describe('WorkZoneEditor', () => {
  beforeEach(() => {
    resetStores();
    isMockWorkZoneEnabled.mockReturnValue(false);
    getWorkZone.mockReset();
    saveWorkZone.mockReset();
    getWorkZone.mockResolvedValue({
      geometry: null,
      version: null,
      zoneId: null,
      updatedAt: null,
      mock: false,
    });
    saveWorkZone.mockResolvedValue({
      robotId: 'MOWER-01',
      zoneId: 12,
      version: 1,
      updatedAt: '2026-06-15T10:01:00',
      saved: true,
    });
    useZoneStore.setState({
      zonesByRobotId: {},
      versionsByRobotId: {},
      draftVerticesByRobotId: {},
      editingByRobotId: {},
    });
  });

  afterEach(cleanup);

  it('실제 대체 지도에서는 기존 구역을 조회하되 편집과 저장은 차단한다', async () => {
    useZoneStore.setState({ mapReady: false });
    useZoneStore.getState().startEditing('MOWER-01', [[127.45, 36.62], [127.46, 36.62], [127.46, 36.63]]);
    render(<WorkZoneEditor />);
    await waitFor(() => expect(getWorkZone).toHaveBeenCalledWith('MOWER-01'));
    expect(screen.getByRole('button', { name: '작업 구역 저장' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '작업 구역 저장' }));
    expect(saveWorkZone).not.toHaveBeenCalled();
  });

  it('지도 복구 후 보존된 편집 내용을 저장할 수 있다', async () => {
    useZoneStore.setState({ mapReady: false });
    useZoneStore.getState().startEditing('MOWER-01', [[127.45, 36.62], [127.46, 36.62], [127.46, 36.63]]);
    render(<WorkZoneEditor />);
    await waitFor(() => expect(getWorkZone).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '작업 구역 저장' })).toBeDisabled();
    act(() => useZoneStore.getState().setMapReady(true));
    fireEvent.click(screen.getByRole('button', { name: '작업 구역 저장' }));
    await waitFor(() => expect(saveWorkZone).toHaveBeenCalledTimes(1));
  });

  it('명시적 개발 샘플 편집은 대체 지도에서도 가능하고 샘플임을 안내한다', async () => {
    isMockWorkZoneEnabled.mockReturnValue(true);
    useZoneStore.setState({ mapReady: false });
    render(<WorkZoneEditor />);
    await waitFor(() => expect(getWorkZone).toHaveBeenCalled());
    expect(screen.getByText('개발용 샘플 좌표 편집입니다. 실제 DB에는 저장하지 않습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새 구역 그리기' })).toBeEnabled();
  });

  it('새 구역 편집을 시작하고 꼭짓점이 부족하면 저장을 차단한다', () => {
    render(<WorkZoneEditor />);

    fireEvent.click(screen.getByRole('button', { name: '새 구역 그리기' }));

    expect(screen.getByText('지도에서 꼭짓점을 선택하세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '작업 구역 저장' })).toBeDisabled();
  });

  it('조회한 실제 작업 구역과 version을 store에 반영한다', async () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [127.45, 36.62] as [number, number],
          [127.46, 36.62] as [number, number],
          [127.46, 36.63] as [number, number],
          [127.45, 36.62] as [number, number],
        ],
      ],
    };
    getWorkZone.mockResolvedValue({
      geometry,
      version: 4,
      zoneId: 12,
      updatedAt: '2026-06-15T10:00:00',
      mock: false,
    });

    render(<WorkZoneEditor />);

    await waitFor(() => expect(getWorkZone).toHaveBeenCalledWith('MOWER-01'));
    expect(useZoneStore.getState().zonesByRobotId['MOWER-01']).toEqual(geometry);
    expect(useZoneStore.getState().versionsByRobotId['MOWER-01']).toBe(4);
    expect(screen.getByText('실제 저장 모드')).toBeInTheDocument();
  });

  it('저장된 작업 구역을 기존 꼭짓점으로 편집 시작하고 취소할 수 있다', async () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [127.45, 36.62] as [number, number],
          [127.46, 36.62] as [number, number],
          [127.46, 36.63] as [number, number],
          [127.45, 36.62] as [number, number],
        ],
      ],
    };
    getWorkZone.mockResolvedValue({
      geometry,
      version: 4,
      zoneId: 12,
      updatedAt: '2026-06-15T10:00:00',
      mock: false,
    });

    render(<WorkZoneEditor />);
    await screen.findByRole('button', { name: '기존 구역 수정' });
    fireEvent.click(screen.getByRole('button', { name: '기존 구역 수정' }));

    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual([
      [127.45, 36.62],
      [127.46, 36.62],
      [127.46, 36.63],
    ]);

    fireEvent.click(screen.getByRole('button', { name: '편집 취소' }));

    expect(useZoneStore.getState().editingByRobotId['MOWER-01']).toBe(false);
    expect(screen.getByRole('button', { name: '기존 구역 수정' })).toBeInTheDocument();
  });

  it('유효한 꼭짓점을 현재 version과 함께 저장하고 새 version을 반영한다', async () => {
    useZoneStore.setState({
      versionsByRobotId: { 'MOWER-01': 4 },
      editingByRobotId: { 'MOWER-01': true },
      draftVerticesByRobotId: {
        'MOWER-01': [
          [127.45, 36.62],
          [127.46, 36.62],
          [127.46, 36.63],
        ],
      },
    });

    render(<WorkZoneEditor />);
    fireEvent.click(screen.getByRole('button', { name: '작업 구역 저장' }));

    await waitFor(() => expect(saveWorkZone).toHaveBeenCalledTimes(1));
    expect(saveWorkZone).toHaveBeenCalledWith('MOWER-01', expect.any(Object), 4);
    expect(useZoneStore.getState().versionsByRobotId['MOWER-01']).toBe(1);
    expect(screen.getByText('작업 구역을 저장했습니다.')).toBeInTheDocument();
  });

  it('409 충돌 시 편집을 유지하고 명시적 재조회 후 새 버전으로 저장한다', async () => {
    const geometry = { type: 'Polygon' as const, coordinates: [[
      [127.45, 36.62] as [number, number], [127.46, 36.62] as [number, number],
      [127.46, 36.63] as [number, number], [127.45, 36.62] as [number, number],
    ]] };
    getWorkZone.mockResolvedValue({ geometry, version: 4, mock: false });
    saveWorkZone.mockRejectedValueOnce(new ApiError('Conflict', 'validation', 409));
    render(<WorkZoneEditor />);
    fireEvent.click(await screen.findByRole('button', { name: '기존 구역 수정' }));
    const draft = useZoneStore.getState().draftVerticesByRobotId['MOWER-01'];
    fireEvent.click(screen.getByRole('button', { name: '작업 구역 저장' }));
    await screen.findByText(/다른 사용자가 작업 구역을 변경했습니다/);
    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual(draft);
    expect(useZoneStore.getState().versionsByRobotId['MOWER-01']).toBe(4);
    expect(screen.getByRole('button', { name: '작업 구역 저장' })).toBeDisabled();
    getWorkZone.mockResolvedValue({ geometry, version: 5, mock: false });
    fireEvent.click(screen.getByRole('button', { name: '최신 구역 다시 불러오기' }));
    await screen.findByText(/최신 작업 구역을 불러왔습니다/);
    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual(draft);
    expect(useZoneStore.getState().editingByRobotId['MOWER-01']).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '작업 구역 저장' }));
    await waitFor(() => expect(saveWorkZone).toHaveBeenLastCalledWith('MOWER-01', expect.any(Object), 5));
  });

  it('저장 실패 시 편집 내용을 유지하고 사용자 메시지를 표시한다', async () => {
    saveWorkZone.mockRejectedValue(new Error('network error'));
    useZoneStore.setState({
      editingByRobotId: { 'MOWER-01': true },
      draftVerticesByRobotId: {
        'MOWER-01': [
          [127.45, 36.62],
          [127.46, 36.62],
          [127.46, 36.63],
        ],
      },
    });

    render(<WorkZoneEditor />);
    fireEvent.click(screen.getByRole('button', { name: '작업 구역 저장' }));

    expect(await screen.findByText('작업 구역을 저장하지 못했습니다. 편집 내용은 유지됩니다.')).toBeInTheDocument();
    expect(useZoneStore.getState().editingByRobotId['MOWER-01']).toBe(true);
  });
});
