import { describe, expect, it } from 'vitest';
import {
  closePolygonVertices,
  openPolygonVertices,
  projectFallbackPoint,
} from './workZoneEditing';

describe('workZoneEditing', () => {
  it('열린 꼭짓점 3개 이상을 닫힌 Polygon으로 만든다', () => {
    const vertices = [
      [127.45, 36.62],
      [127.46, 36.62],
      [127.46, 36.63],
    ] as const;

    expect(closePolygonVertices(vertices)).toEqual({
      type: 'Polygon',
      coordinates: [[vertices[0], vertices[1], vertices[2], vertices[0]]],
    });
    expect(closePolygonVertices(vertices.slice(0, 2))).toBeNull();
  });

  it('닫힌 Polygon을 편집용 열린 꼭짓점으로 변환한다', () => {
    expect(
      openPolygonVertices({
        type: 'Polygon',
        coordinates: [
          [
            [127.45, 36.62],
            [127.46, 36.62],
            [127.46, 36.63],
            [127.45, 36.62],
          ],
        ],
      }),
    ).toEqual([
      [127.45, 36.62],
      [127.46, 36.62],
      [127.46, 36.63],
    ]);
  });

  it('fallback 지도 클릭 위치를 지정된 지도 범위 좌표로 변환한다', () => {
    const position = projectFallbackPoint(
      { clientX: 50, clientY: 25 },
      { left: 0, top: 0, width: 100, height: 50 },
      { west: 127.45, south: 36.62, east: 127.47, north: 36.64 },
    );

    expect(position[0]).toBeCloseTo(127.46, 5);
    expect(position[1]).toBeCloseTo(36.63, 5);
  });
});
