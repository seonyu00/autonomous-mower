import { create } from 'zustand';
import type { PolygonGeometry } from './geojson';

type ZoneStore = {
  zonesByRobotId: Record<string, PolygonGeometry | null>;
  setZone: (robotId: string, zone: PolygonGeometry | null) => void;
};

export const useZoneStore = create<ZoneStore>((set) => ({
  zonesByRobotId: {},
  setZone: (robotId, zone) =>
    set((state) => ({
      zonesByRobotId: {
        ...state.zonesByRobotId,
        [robotId]: zone,
      },
    })),
}));
