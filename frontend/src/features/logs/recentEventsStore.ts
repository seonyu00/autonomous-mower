import { create } from 'zustand';
import type { RecentEvent } from './types';

type RecentEventsStore = {
  eventsByRobotId: Record<string, RecentEvent[]>;
  mergeEvents: (robotId: string, events: RecentEvent[]) => void;
};

export const useRecentEventsStore = create<RecentEventsStore>((set) => ({
  eventsByRobotId: {},
  mergeEvents: (robotId, events) => set((state) => {
    // 조회 중 먼저 받은 실시간 이벤트를 뒤늦은 초기 목록으로 덮어쓰지 않는다.
    const merged = new Map<string, RecentEvent>();
    for (const event of [...events, ...(state.eventsByRobotId[robotId] ?? [])]) {
      if (event.robotId !== robotId) continue;
      // 로그 API의 UTC LocalDateTime과 STOMP의 offset 시각을 같은 기준으로 정렬한다.
      const occurredAt = /(?:Z|[+-]\d{2}:\d{2})$/i.test(event.occurredAt) ? event.occurredAt : `${event.occurredAt}Z`;
      merged.set(event.id, { ...event, occurredAt });
    }
    const recent = [...merged.values()]
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || left.id.localeCompare(right.id))
      .slice(0, 3);
    return { eventsByRobotId: { ...state.eventsByRobotId, [robotId]: recent } };
  }),
}));
