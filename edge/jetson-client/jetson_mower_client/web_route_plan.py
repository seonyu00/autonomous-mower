"""웹에서 확인한 경로를 재계산 없이 준비한다. 제어 출력은 하지 않는다."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
from uuid import UUID

from shapely.geometry import LineString, Polygon
from shapely.affinity import scale, translate

from .web_work_zone import MAX_BYTES, fetch, prepare, save_new


def prepare_route(response: dict, robot_id: str, version: int, plan_id: str) -> dict:
    if not isinstance(robot_id, str) or not robot_id.strip() or len(robot_id) > 50 or type(version) is not int or version < 0:
        raise ValueError("로봇 ID와 구역 버전이 유효하지 않습니다.")
    plan_id = str(UUID(plan_id))
    if not isinstance(response, dict) or response.get("success") is not True:
        raise ValueError("경로 조회에 실패했습니다.")
    envelope = response.get("data")
    if not isinstance(envelope, dict) or envelope.get("planId") != plan_id:
        raise ValueError("확인한 경로 ID가 아닙니다.")
    payload = envelope.get("payload")
    if not isinstance(payload, str) or len(payload.encode("utf-8")) > MAX_BYTES:
        raise ValueError("경로 내용이 유효하지 않습니다.")
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    if digest != envelope.get("sha256"):
        raise ValueError("경로 해시가 일치하지 않습니다.")
    data = json.loads(payload)
    if not isinstance(data, dict) or type(data.get("formatVersion")) is not int or (data["formatVersion"], data.get("plannerProfile")) not in {(1, "hd7000w-v1"), (2, "hd7000w-transit-v1")}:
        raise ValueError("지원하지 않는 경로 형식입니다.")
    zone = prepare({"success": True, "data": data.get("workZone")}, robot_id, version)
    preview = data.get("preview")
    if not isinstance(preview, dict) or preview.get("robotId") != robot_id or type(preview.get("zoneId")) is not int or preview["zoneId"] != zone["zoneId"] or type(preview.get("version")) is not int or preview["version"] != version:
        raise ValueError("경로와 작업 구역이 다릅니다.")
    size = preview.get("cellSizeM")
    if type(size) not in (float, int) or not math.isfinite(size) or not 0.2 <= size <= 0.65:
        raise ValueError("격자 간격이 유효하지 않습니다.")
    path = preview.get("path")
    if not isinstance(path, list) or not 2 <= len(path) <= 20000:
        raise ValueError("이동 가능한 경로가 필요합니다.")
    coordinates = []
    for point in path:
        if not isinstance(point, dict) or any(type(point.get(k)) not in (float, int) or not math.isfinite(point[k]) for k in ("lat", "lon")):
            raise ValueError("유효한 경로 좌표가 필요합니다.")
        if not (-85 <= point["lat"] <= 85 and -180 <= point["lon"] <= 180):
            raise ValueError("경로 좌표 범위가 유효하지 않습니다.")
        coordinates.append((point["lon"], point["lat"]))
    rings = zone["zone"]["geometry"]["coordinates"]
    polygon, line = Polygon(rings[0], rings[1:]), LineString(coordinates)
    if not polygon.contains(line) or polygon.boundary.intersects(line):
        raise ValueError("경로가 작업 구역을 벗어납니다.")
    north_scale = 6378137 * math.pi / 180
    def to_meters(geometry, reference=polygon):
        w, s, e, n = reference.bounds
        x_scale = north_scale * math.cos(math.radians((s + n) / 2))
        return scale(translate(geometry, xoff=-w, yoff=-s), xfact=x_scale, yfact=north_scale, origin=(0, 0))
    if to_meters(line).distance(to_meters(polygon.boundary)) <= math.hypot(1.150, 1.030) / 2:
        raise ValueError("차체 경계 여유가 부족합니다.")
    transit = preview.get("transitPath", [])
    if not isinstance(transit, list):
        raise ValueError("진입 경로가 유효하지 않습니다.")
    if data["formatVersion"] == 2:
        travel_zone = data["workZone"].get("travelZone")
        travel_data = {**data["workZone"], "zone": travel_zone}
        travel_prepared = prepare({"success": True, "data": travel_data}, robot_id, version)
        travel_rings = travel_prepared["zone"]["geometry"]["coordinates"]
        travel_polygon = Polygon(travel_rings[0], travel_rings[1:])
        if not travel_polygon.covers(polygon) or not 2 <= len(transit) <= 20000:
            raise ValueError("이동 가능 범위와 진입 경로가 필요합니다.")
        entry_points = []
        for point in transit:
            if not isinstance(point, dict) or any(type(point.get(k)) not in (int, float) or not math.isfinite(point[k]) for k in ("lat", "lon")):
                raise ValueError("진입 좌표가 유효하지 않습니다.")
            entry_points.append((point["lon"], point["lat"]))
        entry_line = LineString(entry_points)
        if entry_points[-1] != coordinates[0] or not travel_polygon.contains(entry_line) or travel_polygon.boundary.intersects(entry_line):
            raise ValueError("진입 경로가 작업 경로와 연결되지 않거나 범위를 벗어납니다.")
        if to_meters(entry_line, travel_polygon).distance(to_meters(travel_polygon.boundary, travel_polygon)) <= math.hypot(1.150, 1.030) / 2:
            raise ValueError("진입 경로의 차체 여유가 부족합니다.")
    elif transit:
        raise ValueError("이 형식은 진입 경로를 지원하지 않습니다.")
    # 서버의 원문 문자열과 해시를 그대로 보존해 좌표를 다시 계산·축약하지 않는다.
    return {"status": "route_prepared", "robotId": robot_id, "zoneId": zone["zoneId"],
            "version": version, "planId": plan_id, "sha256": digest, "payload": payload}


def main() -> None:
    parser = argparse.ArgumentParser(description="웹에서 확인한 경로를 준비합니다. 주행은 실행하지 않습니다.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--api-base-url")
    source.add_argument("--response-file", type=Path)
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--expected-version", required=True, type=int)
    parser.add_argument("--plan-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.response_file:
            with args.response_file.open("rb") as stream:
                content = stream.read(2 * MAX_BYTES + 1025)
            if len(content) > 2 * MAX_BYTES + 1024:
                raise ValueError("응답이 너무 큽니다.")
            response = json.loads(content)
        else:
            response = fetch(args.api_base_url, args.robot_id, os.environ.get("WORK_ZONE_API_TOKEN", ""), args.plan_id)
        save_new(args.output, prepare_route(response, args.robot_id, args.expected_version, args.plan_id))
        print("경로 준비 완료: " + str(UUID(args.plan_id)) + " · 실제 주행은 시작하지 않았습니다.")
    except (ValueError, OSError, UnicodeError):
        parser.exit(1, "경로 준비 실패: 인증·경로 ID·구역 버전·해시·도형·출력 파일을 확인해 주세요.\n")


if __name__ == "__main__":
    main()
