import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores } from '../../../test/testStores';
import { useZoneStore } from '../zoneStore';
import { WorkZoneEditor } from './WorkZoneEditor';

const saveWorkZone = vi.fn();

vi.mock('../zoneApi', () => ({
  saveWorkZone: (...args: unknown[]) => saveWorkZone(...args),
}));

describe('WorkZoneEditor', () => {
  beforeEach(() => {
    resetStores();
    saveWorkZone.mockReset();
    saveWorkZone.mockResolvedValue({
      robotId: 'MOWER-01',
      zone: {
        type: 'Polygon',
        srid: 4326,
        geometry: {
          type: 'Polygon',
          coordinates: [],
        },
      },
      saved: false,
    });
    useZoneStore.setState({
      zonesByRobotId: {},
      draftVerticesByRobotId: {},
      editingByRobotId: {},
    });
  });

  afterEach(cleanup);

  it('새 구역 편집을 시작하고 꼭짓점이 부족하면 저장을 차단한다', () => {
    render(<WorkZoneEditor />);

    fireEvent.click(screen.getByRole('button', { name: '새 구역 그리기' }));

    expect(screen.getByText('지도에서 꼭짓점을 선택하세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '작업 구역 저장' })).toBeDisabled();
  });

  it('유효한 꼭짓점을 저장하고 개발 Mock 결과를 구분해 표시한다', async () => {
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

    await waitFor(() => expect(saveWorkZone).toHaveBeenCalledTimes(1));
    expect(screen.getByText('개발 모드 저장 요청을 확인했습니다. 실제 DB에는 저장되지 않았습니다.')).toBeInTheDocument();
  });
});
