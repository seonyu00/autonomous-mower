"""웹 저장 구역을 별도 준비 파일로 보존한다. ROS·주행 프로세스는 시작하지 않는다."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID

from shapely.geometry import Polygon

MAX_BYTES = 2 * 1024 * 1024


def prepare(response: dict, robot_id: str, expected_version: int) -> dict:
    if not isinstance(response, dict) or response.get("success") is not True:
        raise ValueError("작업 구역 조회에 실패했습니다.")
    data = response.get("data")
    if not isinstance(data, dict) or data.get("robotId") != robot_id:
        raise ValueError("요청한 로봇의 작업 구역이 아닙니다.")
    if type(data.get("version")) is not int or data["version"] < 0 or data["version"] != expected_version:
        raise ValueError("작업 구역 버전이 다릅니다. 웹에서 다시 확인해 주세요.")
    if type(data.get("zoneId")) is not int or data["zoneId"] <= 0:
        raise ValueError("작업 구역 식별자가 유효하지 않습니다.")
    zone = data.get("zone")
    if not isinstance(zone, dict) or zone.get("type") != "Polygon" or zone.get("srid") != 4326:
        raise ValueError("WGS84 Polygon 작업 구역이 필요합니다.")
    geometry = zone.get("geometry")
    if not isinstance(geometry, dict) or geometry.get("type") != "Polygon":
        raise ValueError("다각형 좌표가 필요합니다.")
    rings = geometry.get("coordinates")
    if not isinstance(rings, list) or not rings:
        raise ValueError("작업 구역 경계가 없습니다.")
    for ring in rings:
        if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
            raise ValueError("작업 구역의 경계는 닫힌 고리여야 합니다.")
        for point in ring:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError("좌표는 [경도, 위도] 쌍이어야 합니다.")
            if any(type(v) not in (int, float) or not math.isfinite(v) for v in point):
                raise ValueError("유한한 숫자 좌표가 필요합니다.")
            if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
                raise ValueError("좌표 범위가 유효하지 않습니다.")
    polygon = Polygon(rings[0], rings[1:])
    if not polygon.is_valid or polygon.is_empty or polygon.area <= 0:
        raise ValueError("자기 교차나 잘못된 내부 경계가 있는 작업 구역입니다.")
    # 오목한 경계와 내부 제외 구역을 사각형으로 바꾸거나 자동 보정하지 않는다.
    canonical = json.dumps(zone, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return {"formatVersion": 1, "status": "prepared", "robotId": robot_id,
            "zoneId": data["zoneId"], "version": data["version"],
            "updatedAt": data.get("updatedAt"), "zoneSha256": hashlib.sha256(canonical.encode()).hexdigest(),
            "zone": json.loads(canonical)}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # 인증 토큰이 다른 주소로 전달되지 않도록 리다이렉트를 거부한다.
        return None


def fetch(base_url: str, robot_id: str, token: str, plan_id: str | None = None) -> dict:
    url = urlsplit(base_url)
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError("계정 정보·쿼리가 없는 HTTPS 서버 주소를 지정해 주세요.")
    if not token.strip() or any(c in token for c in "\r\n"):
        raise ValueError("작업 구역 조회용 인증 토큰이 필요합니다.")
    suffix = "" if plan_id is None else "/cpp-preview/plans/" + str(UUID(plan_id))
    limit = MAX_BYTES if plan_id is None else 2 * MAX_BYTES + 1024
    request = Request(base_url.rstrip("/") + "/api/robots/" + quote(robot_id, safe="") + "/work-zone" + suffix,
                      headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as reply:
            body = reply.read(limit + 1)
    except (HTTPError, URLError, TimeoutError) as error:
        raise ValueError("작업 구역 조회에 실패했습니다. 서버 주소·인증·연결 상태를 확인해 주세요.") from error
    if len(body) > limit:
        raise ValueError("작업 구역 응답이 너무 큽니다.")
    return json.loads(body)


def save_new(path: Path, prepared: dict) -> None:
    if path.name in {"boundary.json", "mower_test.sh"} or path.suffix.lower() != ".json":
        raise ValueError("기존 시험 파일과 다른 이름의 JSON 준비 파일을 지정해 주세요.")
    content = json.dumps(prepared, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
    # 기존 파일은 덮어쓰지 않으며, 위치 정보 파일은 소유자만 읽도록 생성한다.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="웹 작업 구역을 별도 파일에 준비합니다. 주행은 실행하지 않습니다.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--api-base-url")
    source.add_argument("--response-file", type=Path, help="기존 작업 구역 GET API 응답 JSON")
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--expected-version", required=True, type=int)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if not args.robot_id.strip() or len(args.robot_id) > 50:
            raise ValueError("로봇 식별자가 유효하지 않습니다.")
        if args.response_file:
            with args.response_file.open("rb") as stream:
                body = stream.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("작업 구역 응답이 너무 큽니다.")
            response = json.loads(body)
        else:
            response = fetch(args.api_base_url, args.robot_id, os.environ.get("WORK_ZONE_API_TOKEN", ""))
        result = prepare(response, args.robot_id, args.expected_version)
        save_new(args.output, result)
        print("작업 구역 준비 파일을 저장했습니다. 실제 주행 연결·검증은 별도로 필요합니다.")
    except (ValueError, OSError, UnicodeError):
        # 좌표·토큰·파일 내용이 오류 출력에 노출되지 않게 한다.
        parser.exit(1, "작업 구역 준비 실패: 입력·인증·버전·도형·출력 파일을 확인해 주세요. 기존 파일은 덮어쓰지 않습니다.\n")


if __name__ == "__main__":
    main()
