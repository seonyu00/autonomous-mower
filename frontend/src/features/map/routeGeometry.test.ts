import { describe, expect, it } from 'vitest';
import { appendRoutePosition, calculateDisplayHeadingDegrees, calculateHeadingDegrees, smoothDisplayPosition, splitRouteByProgress } from './routeGeometry';

describe('routeGeometry', () => {
  const route = [
    [127.45565, 36.62795],
    [127.45595, 36.62812],
    [127.4562, 36.62828],
    [127.4564, 36.6285],
  ] as const;

  it('샘플 경로를 완료 구간과 예정 구간으로 연결되게 분리한다', () => {
    const result = splitRouteByProgress(route, 0.38);

    expect(result.completed).toEqual(route.slice(0, 2));
    expect(result.planned).toEqual(route.slice(1));
    expect(result.completed.at(-1)).toEqual(result.planned[0]);
  });

  it('같은 좌표는 세션 경로에 중복해서 추가하지 않는다', () => {
    const first = appendRoutePosition([], route[0]);
    const duplicate = appendRoutePosition(first, route[0]);
    const moved = appendRoutePosition(duplicate, route[1]);

    expect(duplicate).toEqual([route[0]]);
    expect(moved).toEqual([route[0], route[1]]);
  });

  it('연속된 두 좌표에서 북쪽 기준 진행 방향을 계산한다', () => {
    expect(calculateHeadingDegrees([[127, 36], [127, 36.001]])).toBeCloseTo(0, 0);
    expect(calculateHeadingDegrees([[127, 36], [127.001, 36]])).toBeCloseTo(90, 0);
    expect(calculateHeadingDegrees([[127, 36]])).toBeNull();
  });

  it('최근 세 위치를 평균해 작은 진동을 줄이고 이전 샘플은 제외한다', () => {
    let filtered = smoothDisplayPosition([], [127, 37]);
    filtered = smoothDisplayPosition(filtered.samples, [127.000003, 37]);
    filtered = smoothDisplayPosition(filtered.samples, [126.999997, 37]);
    expect(filtered.position[0]).toBeCloseTo(127, 8);
    filtered = smoothDisplayPosition(filtered.samples, [127.000006, 37]);
    expect(filtered.samples).toHaveLength(3);
    expect(filtered.position[0]).toBeCloseTo(127.000002, 8);
    expect(smoothDisplayPosition([[179.9, 37]], [-179.9, 37]).position).toEqual([-179.9, 37]);
  });

  it('1m 미만의 표시 좌표 변화로는 방향을 표시하지 않는다', () => {
    expect(calculateDisplayHeadingDegrees([[127, 37], [127.000001, 37]])).toBeNull();
    expect(calculateDisplayHeadingDegrees([[127, 37], [127, 37.00002]])).toBeCloseTo(0, 0);
  });

  it('화면 세션 경로는 최신 500개만 유지한다', () => {
    const positions = Array.from({ length: 501 }, (_, index) => [127 + index / 100000, 37] as [number, number]);
    const result = positions.reduce((saved, point) => appendRoutePosition(saved, point), [] as [number, number][]);
    expect(result).toHaveLength(500);
    expect(result[0]).toEqual(positions[1]);
  });
});
