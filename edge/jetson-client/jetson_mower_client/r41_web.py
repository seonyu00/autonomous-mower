"""r41 웹 연동 후보를 구역 파일과 PC 재생으로 검증한다."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile

from shapely.geometry import Point, Polygon

from .vision_web_bridge import RADIUS_M
from .web_work_zone import MAX_BYTES, fetch, prepare

OBSERVATION_MAX_AGE_MS = 3000
OBJECT_TYPES = {
    "person": "PERSON",
    "human": "PERSON",
    "tree": "TREE_CANDIDATE",
    "bush": "BUSH_CANDIDATE",
}


def local_zone(prepared):
    rings = prepared["zone"]["geometry"]["coordinates"]
    if len(rings) != 1:
        raise ValueError("r41에서 내부 제외 구역이 있는 작업 구역을 사용할 수 없습니다.")
    if prepared["version"] <= 0:
        raise ValueError("r41에서 양의 작업 구역 버전이 필요합니다.")
    return {
        "work_zone_id": str(prepared["zoneId"]),
        "work_zone_version": prepared["version"],
        "polygon": [{"lat": lat, "lon": lon} for lon, lat in rings[0][:-1]],
    }


def save_zone_file(path, zone):
    if path.suffix.lower() != ".json":
        raise ValueError("출력 파일 확장자는 .json이어야 합니다.")
    # 완성된 파일만 최종 이름으로 공개하고 기존 세션 파일은 보존한다.
    fd, name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    temp = Path(name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(zone, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.link(temp, path)
    finally:
        temp.unlink()


def zone_matches(payload, zone):
    return (isinstance(payload, dict) and payload.get("work_zone_id") == zone["work_zone_id"]
            and type(payload.get("work_zone_version")) is int
            and payload["work_zone_version"] == zone["work_zone_version"])


def wgs84_point(value):
    if not isinstance(value, dict):
        raise ValueError("WGS84 좌표 객체가 필요합니다.")
    lon, lat = value.get("lon"), value.get("lat")
    if (type(lon) not in (int, float) or type(lat) not in (int, float)
            or not (-180 <= lon <= 180 and -90 <= lat <= 90)):
        raise ValueError("WGS84 좌표 범위를 확인해 주세요.")
    return lon, lat


def enu_to_wgs84(value, origin):
    if not isinstance(value, dict):
        raise ValueError("ENU 좌표 객체가 필요합니다.")
    east, north = value.get("east"), value.get("north")
    if not all(type(axis) in (int, float) and math.isfinite(axis) for axis in (east, north)):
        raise ValueError("ENU 좌표는 유한한 수여야 합니다.")
    lon, lat = origin
    # 기존 관측 지도와 같은 소구역 평면 근사를 사용한다.
    return wgs84_point({"lon": lon + math.degrees(east / (RADIUS_M * math.cos(math.radians(lat)))),
                        "lat": lat + math.degrees(north / RADIUS_M)})


def fresh_timestamp(stamp, reference):
    return (type(stamp) is int and type(reference) is int
            and 0 < stamp <= reference < stamp + OBSERVATION_MAX_AGE_MS)


def valid_snapshot(snapshot, zone, reference_ms):
    if not zone_matches(snapshot, zone):
        raise ValueError("장애물 스냅샷의 작업 구역 ID·버전이 다릅니다.")
    if snapshot.get("schema") != "mower.obstacles.v1":
        raise ValueError("mower.obstacles.v1 스냅샷이 필요합니다.")
    return (
        snapshot.get("frame") == "local_enu"
        and snapshot.get("pose_valid") is True
        and snapshot.get("observation_fresh") is True
        and fresh_timestamp(snapshot.get("observation_unix_ms"), snapshot.get("generated_at_unix_ms"))
        and fresh_timestamp(snapshot.get("generated_at_unix_ms"), reference_ms)
        and fresh_timestamp(snapshot.get("observation_unix_ms"), reference_ms)
    )


def session_id(snapshot):
    value = snapshot.get("session_id")
    if not isinstance(value, str) or not value.strip() or len(value.encode("utf-16-le")) > 128:
        raise ValueError("관측 세션 ID는 서버 계약의 1~64자 범위여야 합니다.")
    return value


def observation_batch(snapshot, zone, boundary, reference_ms):
    if not valid_snapshot(snapshot, zone, reference_ms):
        return None
    session = session_id(snapshot)
    origin = wgs84_point(snapshot.get("origin_wgs84"))
    if abs(origin[1]) > 85:
        raise ValueError("ENU 변환의 원점 위도 범위를 벗어났습니다.")

    observations = {}
    for group in ("static_objects", "dynamic_objects"):
        objects = snapshot.get(group)
        if not isinstance(objects, list):
            raise ValueError("정적·동적 객체 배열이 필요합니다.")
        for obj in objects:
            if not isinstance(obj, dict):
                raise ValueError("장애물은 객체 형식이어야 합니다.")
            label = obj.get("class")
            kind = OBJECT_TYPES.get(label.lower()) if isinstance(label, str) else None
            seen_at = obj.get("last_seen_unix_ms")
            if (kind is None or obj.get("visible") is not True
                    or not fresh_timestamp(seen_at, snapshot["observation_unix_ms"])
                    or not fresh_timestamp(seen_at, reference_ms)):
                continue
            identity = obj.get("id")
            if type(identity) not in (str, int) or not str(identity).strip():
                raise ValueError("표시 가능한 장애물의 객체 ID가 필요합니다.")
            # 세션 ID와 합쳤을 때도 서버 저장 ID 128자 한도 안에 맞춘다.
            key = hashlib.sha256(str(identity).encode("utf-8")).hexdigest()[:40]
            observed_at = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=seen_at)
            item = {"observationId": f"{seen_at}:{key}", "observedAt": observed_at.isoformat(),
                    "objectType": kind}
            if kind == "PERSON":
                lon, lat = enu_to_wgs84(obj.get("position_m"), origin)
                if abs(lat) > 85 or not boundary.covers(Point(lon, lat)):
                    continue
                item.update(longitude=lon, latitude=lat)
            else:
                region = obj.get("region_m")
                if not isinstance(region, list) or not 3 <= len(region) <= 33:
                    raise ValueError("장애물 다각형의 꼭짓점 수를 확인해 주세요.")
                ring = [enu_to_wgs84(point, origin) for point in region]
                if ring[0] != ring[-1]:
                    ring.append(ring[0])
                shape = Polygon(ring)
                if len(ring) > 33 or not shape.is_valid or shape.area <= 0:
                    raise ValueError("유효한 장애물 다각형 외곽이 필요합니다.")
                if shape.intersection(boundary).area <= 0:
                    continue
                # 작업 구역과의 절단은 기존 서버 저장 경로에서 수행한다.
                item["area"] = {"type": "Polygon", "srid": 4326,
                                "geometry": {"type": "Polygon", "coordinates": [ring]}}
            previous = observations.setdefault(item["observationId"], item)
            if previous != item:
                raise ValueError("같은 관측 ID에 서로 다른 내용이 있습니다.")
    if len(observations) > 20:
        raise ValueError("한 스냅샷의 전송 관측 수가 20개를 초과했습니다.")
    if not observations:
        return None
    return {"version": zone["work_zone_version"], "sessionId": session,
            "observations": list(observations.values())}


def replay_observations(lines, zone):
    boundary = Polygon([wgs84_point(point) for point in zone["polygon"]])
    for line_number, raw in enumerate(lines, start=1):
        if not raw.strip():
            continue
        try:
            snapshot = json.loads(raw)
            # 원래 촬영 시각을 유지하고 녹화된 생성 시점을 기준으로 재생한다.
            generated = snapshot.get("generated_at_unix_ms") if isinstance(snapshot, dict) else None
            batch = observation_batch(snapshot, zone, boundary, generated)
        except (ValueError, OverflowError) as error:
            raise ValueError(f"장애물 JSONL {line_number}행: {error}") from error
        if batch is not None:
            yield batch


def replay_preview_routes(lines, zone):
    """기존 무구동 시험기의 /state.json을 시간 순서로 재생한다."""
    session = None
    latest_ms = None
    revision = None
    path = []
    for line_number, raw in enumerate(lines, start=1):
        if not raw.strip():
            continue
        try:
            packet = json.loads(raw)
            if (not isinstance(packet, dict) or packet.get("dry_run") is not True
                    or not zone_matches(packet.get("zone"), zone)):
                raise ValueError("같은 작업 구역의 무구동 미리보기만 재생할 수 있습니다.")
            generated = packet.get("generated_at")
            if type(generated) not in (int, float) or not math.isfinite(generated) or generated <= 0:
                raise ValueError("미리보기 상태의 생성 시각이 필요합니다.")
            stamp = int(generated * 1000)
            if latest_ms is not None and stamp <= latest_ms:
                continue

            event = packet.get("event") or {}
            snap = event.get("obstacle_snapshot") or {}
            if snap:
                current_session = session_id(snap)
                if session is not None and current_session != session:
                    raise ValueError("새 세션은 별도의 JSONL 파일로 재생해 주세요.")
                session = current_session
            result = packet.get("result") or {}
            plan = result.get("planning") or {}
            incoming = plan.get("route_revision")
            if incoming is not None and (type(incoming) is not int or incoming < 0):
                raise ValueError("경로 revision은 비음수 정수여야 합니다.")
            if incoming is not None and revision is not None and incoming < revision:
                continue
            latest_ms = stamp
            if incoming is not None and incoming != revision:
                revision = incoming
                path = []

            pose = event.get("pose") or {}
            received = packet.get("received_at")
            fresh = (type(received) in (int, float) and math.isfinite(received)
                     and 0 <= generated - received < 2)
            usable = (fresh and pose.get("valid") is True and pose.get("yaw_ready") is True
                      and snap and valid_snapshot(snap, zone, stamp))
            reason = result.get("reason") or result.get("status") or "waiting_for_preview"
            if (not usable or result.get("status") not in {"replanned", "unchanged"}
                    or result.get("blocked_by") or incoming is None):
                path = []
                if not usable:
                    reason = "preview_inputs_unavailable"
            elif "remaining_path" in plan:
                points = plan["remaining_path"]
                if not isinstance(points, list):
                    raise ValueError("남은 경로는 좌표 배열이어야 합니다.")
                path = [{"lon": lon, "lat": lat} for lon, lat in map(wgs84_point, points)]
                if len(path) < 2:
                    path = []
                    reason = "no_remaining_path"
            elif result["status"] == "replanned":
                path = []
                reason = "waiting_for_path"
        except (AttributeError, TypeError, ValueError, OverflowError) as error:
            raise ValueError(f"미리보기 JSONL {line_number}행: {error}") from error

        yield {"workZoneId": zone["work_zone_id"], "workZoneVersion": zone["work_zone_version"],
               "sessionId": session, "routeRevision": revision, "generatedAtUnixMs": stamp,
               "observationUnixMs": snap.get("observation_unix_ms") if usable else None,
               "status": "preview" if path else "unavailable", "reason": reason,
               "remainingPath": path}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("prepare-zone", help="서버 작업 구역을 r41 입력 파일로 준비")
    source = export.add_mutually_exclusive_group(required=True)
    source.add_argument("--response-file", type=Path)
    source.add_argument("--api-base-url")
    export.add_argument("--output", type=Path, required=True)
    replay = commands.add_parser("replay-obstacles", help="장애물 JSONL을 관측 API 본문 JSONL로 변환")
    replay.add_argument("--response-file", type=Path, required=True)
    replay.add_argument("--obstacles", type=Path, required=True)
    routes = commands.add_parser("replay-preview-routes", help="기존 무구동 미리보기의 경로 상태 재생")
    routes.add_argument("--response-file", type=Path, required=True)
    routes.add_argument("--preview-states", type=Path, required=True)
    for command in (export, replay, routes):
        command.add_argument("--robot-id", required=True)
        command.add_argument("--expected-version", type=int, required=True)
    args = parser.parse_args()

    try:
        if args.response_file is not None:
            with args.response_file.open("rb") as stream:
                content = stream.read(MAX_BYTES + 1)
            if len(content) > MAX_BYTES:
                raise ValueError("작업 구역 응답이 너무 큽니다.")
            response = json.loads(content)
        else:
            response = fetch(args.api_base_url, args.robot_id, os.environ.get("MOWER_READ_TOKEN", ""))
        zone = local_zone(prepare(response, args.robot_id, args.expected_version))
        if args.command == "prepare-zone":
            save_zone_file(args.output, zone)
        else:
            if args.command == "replay-obstacles":
                source_file, convert = args.obstacles, replay_observations
            else:
                source_file, convert = args.preview_states, replay_preview_routes
            with source_file.open(encoding="utf-8-sig") as input_file:
                for record in convert(input_file, zone):
                    print(json.dumps(record, allow_nan=False))
    except (OSError, ValueError) as error:
        print(f"r41 웹 연동 준비 실패: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
