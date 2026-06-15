import { beforeEach, describe, expect, it } from 'vitest';
import { useZoneStore } from './zoneStore';

describe('zoneStore', () => {
  beforeEach(() => {
    useZoneStore.setState({
      zonesByRobotId: {},
      draftVerticesByRobotId: {},
      editingByRobotId: {},
    });
  });

  it('편집 시작, 꼭짓점 추가, 마지막 점 취소와 초기화를 관리한다', () => {
    const store = useZoneStore.getState();

    store.startEditing('MOWER-01');
    store.addDraftVertex('MOWER-01', [127.45, 36.62]);
    store.addDraftVertex('MOWER-01', [127.46, 36.62]);
    store.undoDraftVertex('MOWER-01');

    expect(useZoneStore.getState().editingByRobotId['MOWER-01']).toBe(true);
    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual([[127.45, 36.62]]);

    useZoneStore.getState().resetDraft('MOWER-01');
    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual([]);
  });
});
