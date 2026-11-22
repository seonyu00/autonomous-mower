import { Blob as NodeBlob } from 'node:buffer';
import { expect, it } from 'vitest';
import { readMissionReplay } from './missionReplay';

const anchor = { lat: 36, lon: 127 };
const polygon = [anchor, { lat: 36.001, lon: 127.001 }, { lat: 36.001, lon: 127 }];
const zone = { work_zone_id: '2', work_zone_version: 11 };
const start = { type: 'run_start', schema: 'mower.mission.log.v1', work_zone: { ...zone, polygon } };
const route = { type: 'route', route_revision: 1, path: polygon, reason: 'initial_or_resume' };
const offset = { east: 12, north: 3 };
const tree = { id: 's-1', class: 'tree', visible: false, position_m: offset,
  region_m: [offset], safety_region_m: [offset] };
const snapshot = { ...zone, schema: 'mower.obstacles.v1', frame: 'local_enu', session_id: 'a', sequence: 1,
  origin_wgs84: anchor, pose_valid: true, observation_fresh: true,
  static_objects: [tree], dynamic_objects: [], temporary_objects: [] };
function step(time: number, remaining: number, revision = 1, snap: typeof snapshot | null = snapshot) {
  return { type: 'step', at_unix_ms: time, path_remaining: remaining, next_waypoint: polygon[1],
    planning: { route_revision: revision }, input: { obstacle_snapshot: snap } };
}
function read(rows: unknown[]) {
  const bytes = new NodeBlob([rows.map(row => JSON.stringify(row)).join('\r\n')]);
  return readMissionReplay(bytes as unknown as Blob);
}

it('같은 경로 버전에서도 남은 선을 줄이고 버전 교체·빈 경로를 반영한다', async () => {
  const next = { ...route, route_revision: 2, path: polygon.slice().reverse() };
  const { frames, changes } = await read([start, route, step(10, 3), step(20, 2), next, step(30, 3, 2), step(40, 0, 2)]);
  expect(frames.map(f => f.path.length)).toEqual([3, 2, 3, 0]);
  expect(frames[0].target).toEqual(frames[0].path[1]);
  expect(frames[1].path).toEqual(frames[0].path.slice(1));
  expect(frames[2].path).toEqual(frames[0].path.slice().reverse());
  expect(changes.map(c => c.frame)).toEqual([0, 2]);
  expect(frames[3].complete).toBe(false);
});

it('동일 관측을 재사용하고 미관측·오래된 순번·새 세션을 구별한다', async () => {
  const { frames } = await read([start, route, step(10, 0), step(20, 0), step(30, 0, 1, null),
    step(40, 0, 1, { ...snapshot, sequence: 0, static_objects: [] }),
    step(50, 0, 1, { ...snapshot, sequence: 2, static_objects: [] }),
    step(60, 0, 1, { ...snapshot, session_id: 'b', pose_valid: false })]);
  expect(frames.map(f => f.fresh)).toEqual([true, true, false, false, true, false]);
  expect(frames.map(f => f.objects.length)).toEqual([1, 1, 1, 1, 0, 0]);
  expect(frames[0].objects[0]).toMatchObject({ position: [12, -3], visible: false });
  expect(frames[1].objects).toBe(frames[0].objects);
});

it('구역 혼합·경로 기록 누락·두 세션 연결은 행 번호와 함께 거부한다', async () => {
  await expect(read([start, step(10, 0, 0, { ...snapshot, work_zone_version: 12 })])).rejects.toThrow('2행');
  await expect(read([start, step(10, 2)])).rejects.toThrow('2행');
  await expect(read([start, route, start])).rejects.toThrow('3행');
});
