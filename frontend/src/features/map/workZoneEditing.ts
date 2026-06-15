import type { LngLat, PolygonGeometry } from './geojson';
import { DEFAULT_MAP_CENTER } from './mapDefaults';

type ReadonlyLngLat = readonly [longitude: number, latitude: number];

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type ScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const fallbackMapBounds: MapBounds = {
  west: DEFAULT_MAP_CENTER[0] - 0.00175,
  south: DEFAULT_MAP_CENTER[1] - 0.0012,
  east: DEFAULT_MAP_CENTER[0] + 0.00175,
  north: DEFAULT_MAP_CENTER[1] + 0.0012,
};

export function closePolygonVertices(vertices: readonly ReadonlyLngLat[]): PolygonGeometry | null {
  if (vertices.length < 3) {
    return null;
  }

  const ring = vertices.map(([longitude, latitude]): LngLat => [longitude, latitude]);

  return {
    type: 'Polygon',
    coordinates: [[...ring, ring[0]]],
  };
}

export function openPolygonVertices(polygon: PolygonGeometry | null | undefined): LngLat[] {
  const ring = polygon?.coordinates[0] ?? [];

  if (ring.length > 1 && samePosition(ring[0], ring[ring.length - 1])) {
    return ring.slice(0, -1);
  }

  return [...ring];
}

export function projectFallbackPoint(
  point: { clientX: number; clientY: number },
  rect: ScreenRect,
  bounds: MapBounds = fallbackMapBounds,
): LngLat {
  const normalizedX = clamp((point.clientX - rect.left) / Math.max(rect.width, 1));
  const normalizedY = clamp((point.clientY - rect.top) / Math.max(rect.height, 1));

  return [
    bounds.west + normalizedX * (bounds.east - bounds.west),
    bounds.north - normalizedY * (bounds.north - bounds.south),
  ];
}

export function toFallbackSvgPoint(
  position: LngLat,
  bounds: MapBounds = fallbackMapBounds,
): [x: number, y: number] {
  const x = ((position[0] - bounds.west) / (bounds.east - bounds.west)) * 1000;
  const y = ((bounds.north - position[1]) / (bounds.north - bounds.south)) * 620;
  return [x, y];
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function samePosition(a: LngLat, b: LngLat) {
  return a[0] === b[0] && a[1] === b[1];
}
