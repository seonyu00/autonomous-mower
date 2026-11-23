import { isValidLngLat, type LngLat } from '../map/geojson';

type Coordinate = { lat: number; lon: number };
type Offset = { east: number; north: number };
type Point = [number, number];
type Zone = { work_zone_id: string; work_zone_version: number; polygon: Coordinate[] };
type RawObject = {
  id: string; class: string; visible: boolean; position_m: Offset;
  region_m: Offset[]; safety_region_m: Offset[];
};
type Snapshot = Pick<Zone, 'work_zone_id' | 'work_zone_version'> & {
  schema: string; frame: string; session_id: string; sequence: number; origin_wgs84: Coordinate;
  pose_valid: boolean; observation_fresh: boolean;
  static_objects: RawObject[]; dynamic_objects: RawObject[]; temporary_objects: RawObject[];
};
type MapObject = { id: string; label: string; visible: boolean; position: Point; region: Point[]; safety: Point[] };
export type ReplayFrame = {
  time: number; revision: number | null; path: Point[]; target: Point | null; pose: Point | null;
  reason: string; objects: MapObject[]; fresh: boolean; complete: boolean;
};
export type MissionReplay = {
  zoneId: string; version: number; boundary: Point[]; frames: ReplayFrame[];
  anchor: Coordinate;
  changes: { frame: number; revision: number; reason: string }[];
};

const metersPerDegree = Math.PI * 6378137 / 180;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 북쪽이 위인 도식의 미터 좌표. 경위도와 관측기 ENU의 원점은 서로 다를 수 있다.
function project(point: Coordinate, anchor: Coordinate): Point {
  check(point && isValidLngLat(point.lon, point.lat), '위경도 좌표를 확인해 주세요.');
  return [(point.lon - anchor.lon) * metersPerDegree * Math.cos(anchor.lat * Math.PI / 180),
    (anchor.lat - point.lat) * metersPerDegree];
}

// 재생 도식의 미터 좌표를 로그의 구역 원점으로 되돌려 위성 지도에 표시한다.
export function replayLngLat([east, south]: Point, anchor: Coordinate): LngLat {
  return [anchor.lon + east / (metersPerDegree * Math.cos(anchor.lat * Math.PI / 180)),
    anchor.lat - south / metersPerDegree];
}

function objectsAt(snapshot: Snapshot, anchor: Coordinate): MapObject[] {
  const origin = snapshot.origin_wgs84;
  const [x, y] = project(origin, anchor);
  const eastScale = Math.cos(anchor.lat * Math.PI / 180) / Math.cos(origin.lat * Math.PI / 180);
  function offset(p: Offset): Point {
    check(p && Number.isFinite(p.east) && Number.isFinite(p.north), '장애물 ENU 좌표를 확인해 주세요.');
    return [x + p.east * eastScale, y - p.north];
  }
  return [snapshot.static_objects, snapshot.dynamic_objects, snapshot.temporary_objects].flatMap(group => {
    check(Array.isArray(group), '장애물 배열이 누락됐습니다.');
    return group.map(obj => ({
      id: obj.id, label: obj.class, visible: obj.visible === true,
      position: offset(obj.position_m), region: obj.region_m.map(offset), safety: obj.safety_region_m.map(offset),
    }));
  });
}

export async function readMissionReplay(file: Blob, signal?: AbortSignal): Promise<MissionReplay> {
  let zone: Zone | undefined;
  let mission: MissionReplay | undefined;
  const routes = new Map<number, { points: Point[]; reason: string }>();
  let lastRevision: number | null = null;
  let visionSession: string | undefined;
  let lastSequence = -1;
  let objects: MapObject[] = [];
  let lineNumber = 0;

  function consume(line: string) {
    lineNumber++;
    if (!line.trim()) return;
    const row = JSON.parse(line);
    if (row.type === 'run_start') {
      check(!mission && row.schema === 'mower.mission.log.v1', 'r57 단일 세션의 mission.jsonl을 선택해 주세요.');
      const input: Zone = row.work_zone;
      check(typeof input?.work_zone_id === 'string' && input.work_zone_id.trim()
        && Number.isInteger(input.work_zone_version) && input.work_zone_version > 0 && Array.isArray(input.polygon)
        && input.polygon.length >= 3,
        '시작 기록에 작업 구역이 누락됐습니다.');
      zone = input;
      mission = { zoneId: input.work_zone_id, version: input.work_zone_version, anchor: input.polygon[0],
        boundary: input.polygon.map(p => project(p, input.polygon[0])), frames: [], changes: [] };
      return;
    }
    check(mission && zone, '첫 기록에 미션 시작 정보가 필요합니다.');
    const anchor = zone.polygon[0];
    if (row.type === 'route') {
      check(Number.isInteger(row.route_revision) && !routes.has(row.route_revision) && Array.isArray(row.path)
        && typeof row.reason === 'string',
        '경로 버전 또는 좌표 배열을 확인해 주세요.');
      routes.set(row.route_revision, { points: row.path.map((p: Coordinate) => project(p, anchor)), reason: row.reason });
      return;
    }
    if (row.type !== 'step') return;
    const time = row.at_unix_ms;
    check(Number.isSafeInteger(time) && time >= (mission.frames.at(-1)?.time ?? 1), '판단 시각이 잘못됐습니다.');
    const plan = row.planning;
    const revision: number | null = plan?.route_revision ?? null;
    const route = revision === null ? undefined : routes.get(revision);
    const remaining = row.path_remaining;
    check(Number.isInteger(remaining) && remaining >= 0 && remaining <= (route?.points.length ?? 0),
      '남은 경로와 해당 버전의 경로 기록이 일치하지 않습니다.');
    if (route && revision !== null && lastRevision !== revision) {
      mission.changes.push({ frame: mission.frames.length, revision, reason: route.reason });
      lastRevision = revision;
    }
    const snap: Snapshot | null = row.input?.obstacle_snapshot;
    let fresh = false;
    if (snap) {
      check(snap.work_zone_id === zone.work_zone_id && snap.work_zone_version === zone.work_zone_version,
        '장애물과 작업 구역의 ID 또는 버전이 다릅니다.');
      if (snap.session_id !== visionSession) {
        visionSession = snap.session_id;
        lastSequence = -1;
        objects = [];
      }
      check(typeof visionSession === 'string' && visionSession.length && Number.isSafeInteger(snap.sequence)
        && snap.sequence >= 0, '관측 세션 또는 순번을 확인해 주세요.');
      if (snap.sequence >= lastSequence) {
        fresh = snap.schema === 'mower.obstacles.v1' && snap.frame === 'local_enu'
          && snap.pose_valid === true && snap.observation_fresh === true && !!snap.origin_wgs84;
        if (fresh && snap.sequence > lastSequence) objects = objectsAt(snap, anchor);
        lastSequence = snap.sequence;
      }
    }
    const pose = row.input?.pose;
    mission.frames.push({ time, revision, path: route && remaining >= 2 ? route.points.slice(-remaining) : [],
      target: row.next_waypoint ? project(row.next_waypoint, anchor) : null,
      pose: pose?.valid === true ? project(pose, anchor) : null,
      reason: typeof row.motion_proposal?.reason === 'string' ? row.motion_proposal.reason : '',
      complete: plan?.status === 'route_exhausted' && plan.unreachable_passes === 0, objects, fresh });
  }

  // 긴 원본을 통째로 메모리에 보관하지 않고 줄 경계와 UTF-8 문자 경계를 유지한다.
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunkSize = 512 * 1024;
  let tail = '';
  try {
    for (let start = 0; start < file.size; start += chunkSize) {
      signal?.throwIfAborted();
      const bytes = await file.slice(start, start + chunkSize).arrayBuffer();
      const lines = (tail + decoder.decode(bytes, { stream: true })).split('\n');
      tail = lines.pop()!;
      for (const line of lines) consume(line);
    }
    consume(tail + decoder.decode());
    const result = mission as MissionReplay | undefined;
    check(result?.frames.length, '주행 판단 기록이 없습니다.');
    return result;
  } catch (cause) {
    signal?.throwIfAborted();
    throw new Error(`${lineNumber || 1}행 · ${cause instanceof Error ? cause.message : '로그를 읽지 못했습니다.'}`);
  }
}
