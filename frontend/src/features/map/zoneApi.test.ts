import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const put = vi.fn();
const env = vi.hoisted(() => ({
  enableMockWorkZone: false,
}));

vi.mock('../../shared/api/httpClient', () => ({
  httpClient: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
  },
}));

vi.mock('../../shared/config/env', () => ({
  env,
}));

import { getWorkZone, saveWorkZone } from './zoneApi';
import type { PolygonGeometry } from './geojson';

const polygon: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [127.45, 36.62],
      [127.46, 36.62],
      [127.46, 36.63],
      [127.45, 36.62],
    ],
  ],
};

describe('zoneApi', () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    env.enableMockWorkZone = false;
  });

  it('실제 모드에서 백엔드 작업 구역 응답을 프론트 snapshot으로 변환한다', async () => {
    get.mockResolvedValue({
      zoneId: 12,
      robotId: 'MOWER-01',
      version: 4,
      updatedAt: '2026-06-15T10:00:00',
      zone: {
        type: 'Polygon',
        srid: 4326,
        geometry: polygon,
      },
    });

    await expect(getWorkZone('MOWER-01')).resolves.toEqual({
      geometry: polygon,
      version: 4,
      zoneId: 12,
      updatedAt: '2026-06-15T10:00:00',
      mock: false,
    });
    expect(get).toHaveBeenCalledWith('/api/robots/MOWER-01/work-zone');
  });

  it('실제 저장 요청에 현재 version을 expectedVersion으로 포함한다', async () => {
    put.mockResolvedValue({
      saved: true,
      robotId: 'MOWER-01',
      zoneId: 12,
      version: 5,
      updatedAt: '2026-06-15T10:01:00',
    });

    await saveWorkZone('MOWER-01', polygon, 4);

    expect(put).toHaveBeenCalledWith('/api/robots/MOWER-01/work-zone', {
      robotId: 'MOWER-01',
      expectedVersion: 4,
      zone: {
        type: 'Polygon',
        srid: 4326,
        geometry: polygon,
      },
    });
  });

  it('Mock 모드에서는 네트워크 요청 없이 샘플 작업 구역을 반환한다', async () => {
    env.enableMockWorkZone = true;

    const result = await getWorkZone('MOWER-01');

    expect(result?.mock).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});
