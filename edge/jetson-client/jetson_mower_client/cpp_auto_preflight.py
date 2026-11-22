"""웹 계획과 r60 무구동 입력을 비교한다. 주행 허용은 판정하지 않는다."""
import argparse
import json
import math
import os
from pathlib import Path
import time

from .r41_web import Polygon, local_zone, valid_snapshot, wgs84_point, zone_matches
from .cpp_web_preview import preview_source
from .web_route_plan import prepare_route
from .web_work_zone import MAX_BYTES, fetch, prepare


def inspect(response, robot_id, version, plan_id, zone, packet, now_ms):
    plan = prepare_route(response, robot_id, version, plan_id)
    payload = json.loads(plan["payload"])
    web_zone = local_zone(prepare(
        {"success": True, "data": payload["workZone"]}, robot_id, version,
    ))
    boundary = Polygon([wgs84_point(p) for p in web_zone["polygon"]])
    local_boundary = Polygon([wgs84_point(p) for p in zone["polygon"]])
    if not zone_matches(zone, web_zone) or not local_boundary.equals(boundary):
        raise ValueError("r60 구역 파일과 웹 계획의 작업 구역이 다릅니다.")

    source = preview_source(packet, web_zone)
    stamp = source["at_unix_ms"]
    status_fresh = type(stamp) is int and 0 <= now_ms - stamp <= 500
    pose = source["input"].get("pose") or {}
    pose_fresh = status_fresh and pose.get("valid") is True and pose.get("yaw_ready") is True and all(
        type(pose.get(key)) is int and 0 <= stamp - pose[key] <= 500
        for key in ("timestamp_unix_ms", "yaw_timestamp_unix_ms")
    )
    uncertainty = pose.get("position_uncertainty_m")
    pose_usable = (pose_fresh and type(uncertainty) in (int, float)
                   and math.isfinite(uncertainty) and 0 <= uncertainty <= .10)
    if pose_usable:
        wgs84_point(pose)
    snapshot = source["input"].get("obstacle_snapshot")
    obstacles_fresh = status_fresh and bool(snapshot) and valid_snapshot(snapshot, web_zone, now_ms)
    # 최초 계획의 전체 좌표만 대조한다. 진행 후 남은 경로는 비교 기준이 아니다.
    preview = payload["preview"]
    expected = preview.get("transitPath", [])[:-1] + preview["path"]
    planning = packet.get("planning") or {}
    reported = planning.get("remaining_path")
    comparison = "unavailable"
    if (status_fresh and planning.get("status") == "replanned" and planning.get("route_revision") == 1
            and isinstance(reported, list) and len(reported) >= 2):
        comparison = ("match" if list(map(wgs84_point, reported)) == list(map(wgs84_point, expected))
                      else "different")
    return {
        "robotId": robot_id, "planId": plan["planId"], "sha256": plan["sha256"],
        "workZoneId": plan["zoneId"], "workZoneVersion": version,
        "statusFresh": status_fresh, "poseUsableForPreview": pose_usable,
        "obstaclesFresh": obstacles_fresh,
        "initialPathComparison": comparison,
        "unconfirmed": ["reviewed_plan_applied_by_runner", "local_drive_authority"],
    }


def read_json(path):
    with path.open("rb") as stream:
        content = stream.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise ValueError("입력 파일이 너무 큽니다.")
    return json.loads(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base-url", required=True)
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--zone-version", type=int, required=True)
    parser.add_argument("--plan-id", required=True)
    parser.add_argument("--zone", type=Path, required=True)
    parser.add_argument("--status", type=Path, required=True, help="최근 r60 무구동 상태 JSON 한 건")
    args = parser.parse_args()
    try:
        response = fetch(args.api_base_url, args.robot_id, os.environ.get("WORK_ZONE_API_TOKEN", ""), args.plan_id)
        report = inspect(response, args.robot_id, args.zone_version, args.plan_id,
                         read_json(args.zone), read_json(args.status), time.time_ns() // 1_000_000)
        print(json.dumps(report, ensure_ascii=False))
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        parser.exit(1, f"무구동 사전 확인 실패: {error}\n")


if __name__ == "__main__":
    main()
