import { describe, expect, it } from 'vitest';
import { mockTelemetry } from '../telemetry/mockTelemetry';
import { DEFAULT_MAP_CENTER } from './mapDefaults';
import { mockRouteByRobotId } from './mockMapData';
import { fallbackMapBounds } from './workZoneEditing';

describe('지도 기본 위치', () => {
  it('요청한 위도와 경도를 MOWER-01 지도 기준으로 사용한다', () => {
    expect(DEFAULT_MAP_CENTER).toEqual([127.45455324663685, 36.6259428230794]);
    expect(mockTelemetry['MOWER-01'].longitude).toBe(DEFAULT_MAP_CENTER[0]);
    expect(mockTelemetry['MOWER-01'].latitude).toBe(DEFAULT_MAP_CENTER[1]);
    expect(mockRouteByRobotId['MOWER-01'].geometry.coordinates.at(-1)).toEqual(
      DEFAULT_MAP_CENTER,
    );
  });

  it('fallback 지도 범위의 중앙도 같은 기준 좌표를 사용한다', () => {
    expect((fallbackMapBounds.west + fallbackMapBounds.east) / 2).toBeCloseTo(
      DEFAULT_MAP_CENTER[0],
      10,
    );
    expect((fallbackMapBounds.south + fallbackMapBounds.north) / 2).toBeCloseTo(
      DEFAULT_MAP_CENTER[1],
      10,
    );
  });
});
