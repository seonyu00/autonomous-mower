import { create } from 'zustand';
import type { LngLat, PolygonGeometry } from './geojson';

type ZoneStore = {
  zonesByRobotId: Record<string, PolygonGeometry | null>;
  versionsByRobotId: Record<string, number | null>;
  draftVerticesByRobotId: Record<string, LngLat[]>;
  editingByRobotId: Record<string, boolean>;
  setZone: (robotId: string, zone: PolygonGeometry | null, version?: number | null) => void;
  startEditing: (robotId: string, vertices?: LngLat[]) => void;
  stopEditing: (robotId: string) => void;
  addDraftVertex: (robotId: string, position: LngLat) => void;
  setDraftVertices: (robotId: string, vertices: LngLat[]) => void;
  undoDraftVertex: (robotId: string) => void;
  resetDraft: (robotId: string) => void;
};

export const useZoneStore = create<ZoneStore>((set) => ({
  zonesByRobotId: {},
  versionsByRobotId: {},
  draftVerticesByRobotId: {},
  editingByRobotId: {},
  setZone: (robotId, zone, version = null) =>
    set((state) => ({
      zonesByRobotId: {
        ...state.zonesByRobotId,
        [robotId]: zone,
      },
      versionsByRobotId: {
        ...state.versionsByRobotId,
        [robotId]: version,
      },
    })),
  startEditing: (robotId, vertices = []) =>
    set((state) => ({
      draftVerticesByRobotId: {
        ...state.draftVerticesByRobotId,
        [robotId]: [...vertices],
      },
      editingByRobotId: {
        ...state.editingByRobotId,
        [robotId]: true,
      },
    })),
  stopEditing: (robotId) =>
    set((state) => ({
      editingByRobotId: {
        ...state.editingByRobotId,
        [robotId]: false,
      },
    })),
  addDraftVertex: (robotId, position) =>
    set((state) => ({
      draftVerticesByRobotId: {
        ...state.draftVerticesByRobotId,
        [robotId]: [...(state.draftVerticesByRobotId[robotId] ?? []), position],
      },
    })),
  setDraftVertices: (robotId, vertices) =>
    set((state) => ({
      draftVerticesByRobotId: {
        ...state.draftVerticesByRobotId,
        [robotId]: [...vertices],
      },
    })),
  undoDraftVertex: (robotId) =>
    set((state) => ({
      draftVerticesByRobotId: {
        ...state.draftVerticesByRobotId,
        [robotId]: (state.draftVerticesByRobotId[robotId] ?? []).slice(0, -1),
      },
    })),
  resetDraft: (robotId) =>
    set((state) => ({
      draftVerticesByRobotId: {
        ...state.draftVerticesByRobotId,
        [robotId]: [],
      },
    })),
}));
