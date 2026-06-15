import type { LngLat } from './geojson';

export const DEFAULT_MAP_CENTER: LngLat = [127.45455324663685, 36.6259428230794];
export const DEFAULT_MAP_ZOOM = 18;
export const MAX_OPERATIONAL_MAP_ZOOM = 19;

export function offsetFromDefaultCenter(longitudeOffset: number, latitudeOffset: number): LngLat {
  return [
    DEFAULT_MAP_CENTER[0] + longitudeOffset,
    DEFAULT_MAP_CENTER[1] + latitudeOffset,
  ];
}
