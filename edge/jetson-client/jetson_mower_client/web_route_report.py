"""검증한 경로 파일의 준비 사실만 보고한다. 주행이나 AUTO 명령은 보내지 않는다."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, build_opener

from .web_route_plan import prepare_route
from .web_work_zone import MAX_BYTES, NoRedirect, fetch


def report_prepared(base_url: str, robot_id: str, version: int, plan_id: str, path: Path, token: str) -> dict:
    with path.open("rb") as stream:
        content = stream.read(2 * MAX_BYTES + 1025)
    if len(content) > 2 * MAX_BYTES + 1024:
        raise ValueError("준비 파일이 너무 큽니다.")
    local = json.loads(content)
    if not isinstance(local, dict) or local.get("status") != "route_prepared":
        raise ValueError("경로 준비 파일이 필요합니다.")
    verified = prepare_route({"success": True, "data": local}, robot_id, version, plan_id)
    if any(local.get(key) != verified[key] for key in ("robotId", "zoneId", "version")):
        raise ValueError("준비 파일의 식별 정보가 다릅니다.")
    # 조회로 HTTPS·인증·현재 구역 버전과 서버 원문을 다시 확인한다.
    latest = prepare_route(fetch(base_url, robot_id, token, verified["planId"]), robot_id, version, plan_id)
    if latest["sha256"] != verified["sha256"]:
        raise ValueError("현재 서버 경로와 준비 파일이 다릅니다.")
    request = Request(base_url.rstrip("/") + "/api/robots/" + quote(robot_id, safe="") +
                      "/work-zone/cpp-preview/plans/" + verified["planId"] + "/preparation",
                      data=json.dumps({"sha256": verified["sha256"]}).encode(), method="POST",
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as reply:
            body = reply.read(4097)
    except (HTTPError, URLError, TimeoutError) as error:
        raise ValueError("파일은 보존됐으나 보고에 실패했습니다. 인증·권한·구역 버전·연결을 확인하고 재시도하세요.") from error
    if len(body) > 4096:
        raise ValueError("보고 응답이 너무 큽니다.")
    response = json.loads(body)
    data = response.get("data") if isinstance(response, dict) else None
    if not isinstance(response, dict) or response.get("success") is not True or not isinstance(data, dict) or data.get("planId") != verified["planId"] or data.get("sha256") != verified["sha256"] or data.get("reported") is not True or not isinstance(data.get("receivedAt"), str):
        raise ValueError("보고 수신을 확인할 수 없습니다. 같은 파일로 재시도하세요.")
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="파일 준비 결과만 보고합니다. 실제 장비·주행 준비 확인을 뜻하지 않습니다.")
    parser.add_argument("--api-base-url", required=True)
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--expected-version", required=True, type=int)
    parser.add_argument("--plan-id", required=True)
    parser.add_argument("--prepared-file", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = report_prepared(args.api_base_url, args.robot_id, args.expected_version, args.plan_id,
                                 args.prepared_file, os.environ.get("WORK_ZONE_API_TOKEN", ""))
        print("파일 준비 보고 수신: " + result["planId"] + " · 주행 준비나 AUTO 실행 허가를 뜻하지 않습니다.")
    except (ValueError, OSError, UnicodeError):
        parser.exit(1, "파일 준비 보고 실패: 파일은 변경하지 않았습니다. 인증·권한·경로·버전을 확인하고 재시도하세요.\n")


if __name__ == "__main__":
    main()
