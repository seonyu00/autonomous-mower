"""r60 무구동 상태를 구독해 관제 서버의 경로·장애물 조회에 공급한다."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
from urllib.parse import quote
from urllib.request import Request, build_opener
from uuid import UUID

from .r41_web import Polygon, local_zone, observation_batch, valid_snapshot, wgs84_point, zone_matches
from .web_work_zone import MAX_BYTES, NoRedirect, fetch, prepare


def iso(stamp):
    return datetime.fromtimestamp(stamp / 1000, timezone.utc).isoformat()


def preview_frame(packet, zone, boundary, sequence, generation, route_at):
    source = packet["replay"]
    if (packet["planner"] != "edge" or "output_topic" not in packet or packet["output_topic"] is not None
            or "command_at_unix_ms" not in source or source["command_at_unix_ms"] is not None
            or packet.get("armed") is not False or packet.get("v") != 0 or packet.get("w") != 0
            or not zone_matches(packet, zone) or not zone_matches(source, zone)):
        raise ValueError("같은 구역의 무구동 상태만 보고할 수 있습니다.")
    stamp = source["at_unix_ms"]
    plan = packet.get("planning") or {}
    revision = plan.get("route_revision")
    snapshot = source["input"].get("obstacle_snapshot")
    fresh = snapshot is not None and valid_snapshot(snapshot, zone, stamp)
    path = plan.get("remaining_path", [])
    status, reason = "held", "preview_inputs_unavailable"
    points = []
    if fresh and plan.get("status") in {"replanned", "unchanged"} and len(path) >= 2:
        status, reason = "available", "path_reported"
        for point in path:
            lon, lat = wgs84_point(point)
            points.append({"lat": lat, "lon": lon})
    elif fresh and plan.get("status") == "planning_pending":
        status, reason = "pending", "planning_pending"
    report = {
        "generation": generation, "sequence": sequence, "workZoneId": int(zone["work_zone_id"]),
        "workZoneVersion": zone["work_zone_version"], "routeRevision": revision, "status": status,
        "reason": reason, "statusObservedAt": iso(stamp), "routeGeneratedAt": iso(route_at) if points else None,
        "observationObservedAt": iso(snapshot["observation_unix_ms"]) if points else None,
        "remainingPath": points,
    }
    batch = observation_batch(snapshot, zone, boundary, stamp) if fresh else None
    return report, batch


def main():
    import os
    import rclpy
    from rclpy.node import Node
    from std_msgs.msg import String

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base-url", required=True)
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--zone", type=Path, required=True)
    parser.add_argument("--status-topic", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"/mower_preview_[A-Za-z0-9_]+/status", args.status_topic):
        parser.error("무구동 미리보기 세션의 status 토픽을 지정해 주세요.")
    token = os.environ.get("MOWER_PREVIEW_TOKEN", "")
    zone = json.loads(args.zone.read_text(encoding="utf-8"))
    version = zone["work_zone_version"]
    prepared = local_zone(prepare(fetch(args.api_base_url, args.robot_id, token), args.robot_id, version))
    boundary = Polygon([wgs84_point(p) for p in zone["polygon"]])
    if not zone_matches(prepared, zone) or not boundary.equals(Polygon([wgs84_point(p) for p in prepared["polygon"]])):
        parser.error("무구동 파일의 구역과 서버에 저장된 구역이 다릅니다.")

    opener = build_opener(NoRedirect())
    base = args.api_base_url.rstrip("/") + "/api/robots/" + quote(args.robot_id, safe="")

    def api(method, path, data=None):
        request = Request(base + path, method=method, data=json.dumps(data).encode() if data is not None else None,
                          headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        with opener.open(request, timeout=2) as response:
            body = json.loads(response.read(MAX_BYTES + 1))
        if body.get("success") is not True:
            raise ValueError("관제 서버가 미리보기 요청을 거부했습니다.")
        return body["data"]

    rclpy.init()
    node = Node("cpp_web_preview")
    latest = None
    session = None
    generation = None
    last_stamp = 0
    route_at = None
    last_revision = None
    observation_key = None

    def receive(message):
        nonlocal latest
        try:
            latest = json.loads(message.data)
        except ValueError:
            latest = None

    def send():
        nonlocal session, generation, last_stamp, route_at, last_revision, observation_key
        if latest is None or node.count_publishers(args.status_topic) != 1:
            return
        try:
            source = latest["replay"]
            stamp = source["at_unix_ms"]
            if type(stamp) is not int or not 0 <= time.time_ns() // 1_000_000 - stamp < 2500 or stamp <= last_stamp:
                return
            incoming = str(UUID(source["session_id"]))
            if session is not None and incoming != session:
                raise ValueError("다른 미리보기 세션은 별도 실행이 필요합니다.")
            revision = (latest.get("planning") or {}).get("route_revision")
            if revision is not None and revision != last_revision:
                route_at, last_revision = stamp, revision
            report, batch = preview_frame(latest, zone, boundary, stamp, generation, route_at)
            if report["routeRevision"] is None:
                report["routeRevision"] = last_revision
            if session is None:
                zone_id = int(zone["work_zone_id"])
                current = api("GET", f"/jetson-route/latest?workZoneId={zone_id}&workZoneVersion={version}")
                expected = current["generation"] - int(current["sessionId"] == incoming)
                opened = api("POST", "/jetson-route/sessions", {"sessionId": incoming, "workZoneId": zone_id,
                             "workZoneVersion": version, "expectedGeneration": expected, "sourceMode": "preview"})
                session, generation = incoming, opened["generation"]
                report["generation"] = generation
            api("PUT", f"/jetson-route/sessions/{session}/latest", report)
            last_stamp = stamp
            if batch:
                snapshot = source["input"]["obstacle_snapshot"]
                key = snapshot["session_id"], snapshot["sequence"]
                if key != observation_key:
                    api("POST", "/vision-map/observations", batch)
                    observation_key = key
        except (OSError, ValueError, TypeError, KeyError, OverflowError) as error:
            node.get_logger().warning(f"미리보기 보고 실패 ({type(error).__name__}): {error}", throttle_duration_sec=5)

    node.create_subscription(String, args.status_topic, receive, 1)
    node.create_timer(0.5, send)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == "__main__":
    main()
