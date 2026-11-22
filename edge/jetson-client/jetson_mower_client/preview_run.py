"""웹에서 요청한 무구동 CPP 세션만 실행하는 Jetson 작업자."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener
from uuid import UUID

from .r41_web import local_zone, save_zone_file
from .web_work_zone import MAX_BYTES, NoRedirect, fetch, prepare


def run_session(args, run, zone, version, directory):
    token = os.environ["MOWER_PREVIEW_TOKEN"]
    payload = local_zone(prepare(fetch(args.api_base_url, args.robot_id, token), args.robot_id, version))
    if int(payload["work_zone_id"]) != zone:
        raise ValueError("요청한 작업 구역 ID가 변경됐습니다.")
    planner = args.planner_dir
    scope = f"/mower_preview_{run.hex}"
    env = dict(os.environ, MOWER_RUN_ID=str(run))
    device_env = {key: value for key, value in env.items() if key != "MOWER_PREVIEW_TOKEN"}
    if args.semantic_lib:
        device_env["PYTHONPATH"] = os.pathsep.join(filter(None, (str(args.semantic_lib), device_env.get("PYTHONPATH"))))
    if directory.is_dir():
        root = Path(directory)
        zone_file = root / "zone.json"
        work_plan = root / "work-plan.json"
        save_zone_file(zone_file, payload)
        with work_plan.open("wb") as output:
            subprocess.run([sys.executable, str(planner / "local_cpp.py"), str(zone_file), "--export-work-plan"],
                           cwd=planner, env=device_env, stdout=output, check=True, timeout=10)
        children = [
            subprocess.Popen([sys.executable, "-m", "jetson_mower_client.r60_preview_runner",
                              "--planner-dir", str(planner), str(zone_file)], env=device_env),
            subprocess.Popen([
                sys.executable, str(planner.parent / "drive_test_observer" / "recorder.py"),
                "--fused-pose-topic", scope + "/pose", "--model-objects-only", "--output", str(root / "vision"),
                "--work-plan", str(work_plan), "--semantic-model", str(args.model),
                "--ros-args", "-r", f"__node:=observer_{run.hex}", "-r", "/fix:=/dual_gps/fix",
                "-r", "/drive_test/odom:=/dual_gps/odom", "-r", "/drive_test/yaw_ready:=/dual_gps/yaw_ready",
                "-r", f"/mower_cpp/drive_cmd_vel:={scope}/unused_command",
                "-r", f"/drive_test/semantic_observations:={scope}/observations",
                "-r", f"/drive_test/obstacle_snapshot:={scope}/obstacles",
            ], cwd=planner, env=device_env),
            subprocess.Popen([sys.executable, "-m", "jetson_mower_client.cpp_web_preview",
                              "--api-base-url", args.api_base_url, "--robot-id", args.robot_id,
                              "--zone", str(zone_file), "--status-topic", scope + "/status",
                              "--session-id", str(run)], env=env),
        ]
        while all(child.poll() is None for child in children):
            time.sleep(.2)
        raise RuntimeError("무구동 세션 구성 프로세스가 종료됐습니다.")


def stop_session(process):
    # 부모가 먼저 끝났어도 동일 그룹의 관측기와 CPP를 함께 종료한다.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def supervise(args, poll, launch, stopped):
    process, directory, active, seen = None, None, None, None
    try:
        while not stopped():
            try:
                ticket = poll()
                run = UUID(ticket["id"]) if ticket is not None else None
            except (OSError, ValueError, KeyError, TypeError):
                ticket, run = None, None
            if process is not None and (run != active or process.poll() is not None):
                stop_session(process)
                process = None
                directory.cleanup()
                directory = None
            if run is not None and run != seen and not stopped():
                seen = active = run
                directory = tempfile.TemporaryDirectory(prefix="mower-web-preview-")
                process = launch(args, run, ticket["zoneId"], ticket["zoneVersion"], directory.name)
            time.sleep(.5)
    finally:
        if process is not None:
            stop_session(process)
        if directory is not None:
            directory.cleanup()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base-url", required=True)
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--planner-dir", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--semantic-lib", type=Path)
    parser.add_argument("--session", nargs=4, help=argparse.SUPPRESS)
    args = parser.parse_args()
    url = urlsplit(args.api_base_url)
    token = os.environ.get("MOWER_PREVIEW_TOKEN", "")
    if (os.name != "posix" or url.scheme != "https" or not url.hostname or url.username or url.password
            or url.query or url.fragment or not token.strip() or "\r" in token or "\n" in token):
        parser.error("Jetson에서 인증 토큰과 HTTPS 서버 주소를 지정해 주세요.")
    if not args.planner_dir.is_absolute() or not args.model.is_absolute():
        parser.error("CPP 폴더와 모델은 절대 경로로 지정해 주세요.")
    if args.session:
        run, zone, version, directory = args.session
        run_session(args, UUID(run), int(zone), int(version), Path(directory))
        return

    import fcntl

    url = args.api_base_url.rstrip("/") + "/api/robots/" + quote(args.robot_id, safe="") + "/jetson-route/preview-run"
    opener = build_opener(NoRedirect())

    def poll():
        request = Request(url, headers={"Authorization": "Bearer " + token, "Cache-Control": "no-cache"})
        with opener.open(request, timeout=1) as response:
            envelope = json.loads(response.read(MAX_BYTES))
        if envelope["success"] is not True:
            raise ValueError("미리보기 요청 조회 실패")
        return envelope.get("data")

    def launch(args, run, zone, version, directory):
        return subprocess.Popen([sys.executable, "-m", "jetson_mower_client.preview_run",
                                 *sys.argv[1:], "--session", str(run), str(zone), str(version), directory],
                                start_new_session=True, stdin=subprocess.DEVNULL)

    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    key = hashlib.sha256(args.robot_id.encode()).hexdigest()
    lock_path = Path.home() / f".mower-preview-{key}.lock"
    with lock_path.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.exit(1, "이 로봇의 무구동 작업자가 이미 실행 중입니다.\n")
        supervise(args, poll, launch, lambda: stopping)


if __name__ == "__main__":
    main()
