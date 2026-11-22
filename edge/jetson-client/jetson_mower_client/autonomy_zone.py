"""Jetson 자식 프로세스에서 현재 구역을 확인한 뒤 설정된 실행기에 전달한다."""
import argparse
import os
from pathlib import Path
from uuid import UUID

from .r41_web import save_zone_file
from .web_route_plan import r60_preview_zone
from .web_work_zone import fetch


def stage_zone(base_url: str, token: str, robot_id: str, zone_id: int, version: int, directory: Path) -> Path:
    response = fetch(base_url, robot_id, token)
    if not isinstance(response, dict) or response.get("success") is not True:
        raise ValueError("서버에서 작업 구역을 조회하지 못했습니다.")
    zone = r60_preview_zone(response.get("data"), robot_id, version)
    if zone["work_zone_id"] != str(zone_id):
        raise ValueError("요청한 작업 구역이 서버 저장본과 다릅니다.")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = directory / "requested-work-zone.json"
    save_zone_file(target, zone)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("robot_id")
    parser.add_argument("zone_id", type=int)
    parser.add_argument("version", type=int)
    parser.add_argument("runner", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        run_id = str(UUID(os.environ.get("MOWER_RUN_ID", "")))
        directory = Path(os.environ.get("MOWER_PREVIEW_LOG_DIR", ""))
        if (not directory.is_absolute() or directory.name != run_id
                or not args.runner or not Path(args.runner[0]).is_absolute()):
            raise ValueError("실행 관리자가 전달한 작업 폴더와 설정된 실행기가 필요합니다.")
        token = os.environ.pop("WORK_ZONE_API_TOKEN", "")
        target = stage_zone(os.environ.get("MOWER_WORK_ZONE_API_BASE_URL", ""), token,
                            args.robot_id, args.zone_id, args.version, directory)
        # r61 SSH 감독 실행기는 작업 구역이 옵션 뒤 첫 번째 위치에 있어야 한다.
        # 설정 문자열을 셸로 해석하지 않고, 검증한 파일 경로만 치환한다.
        runner = [str(target) if value == "{work-zone}" else value for value in args.runner]
        if "{work-zone}" not in args.runner:
            runner.append(str(target))
        os.execv(runner[0], runner)
    except (OSError, ValueError) as error:
        parser.exit(1, f"작업 구역 준비 실패: {error}\n")


if __name__ == "__main__":
    main()
