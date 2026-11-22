"""터미널 입력 없이 r60 CPP 무구동 상태를 발행한다."""
import argparse
import os
from pathlib import Path
import sys
from uuid import UUID


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--planner-dir", required=True, type=Path)
    parser.add_argument("zone", type=Path)
    args = parser.parse_args()
    try:
        run = UUID(os.environ.get("MOWER_RUN_ID", ""))
    except ValueError:
        parser.error("실행 관리자가 전달한 MOWER_RUN_ID가 필요합니다.")
    if not args.planner_dir.is_absolute() or not args.zone.is_absolute():
        parser.error("CPP 폴더와 작업 구역은 절대 경로로 지정해 주세요.")
    planner = args.planner_dir / "drive_ros.py"
    if not planner.is_file() or not args.zone.is_file():
        parser.error("r60 실행 파일 또는 작업 구역을 찾을 수 없습니다.")

    scope = f"/mower_preview_{run.hex}"
    print(f"r60 무구동 토픽: {scope}/status, {scope}/obstacles", flush=True)
    os.chdir(args.planner_dir)
    # 인자 목록을 고정해 이 실행 경로에서 구동 출력과 시리얼을 열지 않는다.
    os.execv(sys.executable, [
        sys.executable, str(planner), str(args.zone), "--local-zone", "--planner", "edge",
        "--replay-telemetry", "--model-objects-only", "--shared-pose-topic", scope + "/pose",
        "--obstacle-topic", scope + "/obstacles", "--status-topic", scope + "/status",
    ])


if __name__ == "__main__":
    main()
