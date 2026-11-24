"""웹 AUTO에서 관측한 경로와 장애물을 지도 좌표로 변환한다."""

from datetime import datetime, timezone

from .r41_web import enu_to_wgs84, fresh_timestamp, valid_snapshot, wgs84_point, zone_matches


def live_map_frame(packet, run_id, zone_identity, now_ms, feedback=None):
    zone = {"work_zone_id": str(zone_identity[0]), "work_zone_version": zone_identity[1]}
    if (not zone_matches(packet, zone) or packet.get("planner") != "edge"
            or packet.get("output_topic") != "/mower_cpp/drive_cmd_vel"):
        return None
    replay = packet.get("replay")
    if not isinstance(replay, dict) or not fresh_timestamp(replay.get("at_unix_ms"), now_ms):
        return None
    planning = packet.get("planning")
    if not isinstance(planning, dict):
        planning = {}
    path = []
    points = planning.get("remaining_path")
    if planning.get("status") in ("replanned", "unchanged", "replanning_in_background") and isinstance(points, list):
        try:
            path = [wgs84_point(point) for point in points[:400]]
        except ValueError:
            pass
    inputs = replay.get("input")
    snapshot = inputs.get("obstacle_snapshot") if isinstance(inputs, dict) else None
    obstacles = []
    try:
        if isinstance(snapshot, dict) and valid_snapshot(snapshot, zone, now_ms):
            origin = wgs84_point(snapshot.get("origin_wgs84"))
            if abs(origin[1]) <= 85:
                for group in ("dynamic_objects", "static_objects"):
                    items = snapshot.get(group)
                    if not isinstance(items, list):
                        continue
                    for obj in items[:32]:
                        if len(obstacles) >= 16:
                            break
                        if not isinstance(obj, dict) or obj.get("visible") is not True:
                            continue
                        kind = obj.get("class")
                        if kind not in ("person", "tree", "bush") or not fresh_timestamp(obj.get("last_seen_unix_ms"), now_ms):
                            continue
                        try:
                            if kind == "person":
                                obstacles.append({"kind": kind, "position": enu_to_wgs84(obj.get("position_m"), origin)})
                            else:
                                region = obj.get("region_m")
                                if isinstance(region, list) and 3 <= len(region) <= 32:
                                    points = [enu_to_wgs84(point, origin) for point in region]
                                    obstacles.append({"kind": kind, "ring": points + [points[0]]})
                        except ValueError:
                            continue
    except ValueError:
        pass
    frame = {
        "runId": run_id, "zoneId": zone_identity[0], "zoneVersion": zone_identity[1],
        "observedAt": datetime.fromtimestamp(replay["at_unix_ms"] / 1000, timezone.utc).isoformat(),
        "path": path, "obstacles": obstacles,
    }
    if isinstance(feedback, dict):
        pwm = feedback.get("pwm_command")
        if (isinstance(pwm, dict) and pwm.get("mode") == 1
                and all(type(pwm.get(side)) is int and 1000 <= pwm[side] <= 2000 for side in ("left", "right"))):
            frame["pwm"] = {"left": pwm["left"], "right": pwm["right"]}
    return frame
