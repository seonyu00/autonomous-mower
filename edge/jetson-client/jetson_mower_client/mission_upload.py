"""마감된 자율주행 세션 로그를 관제 작업 이력에 등록한다."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import gzip
import io
import json
import os
from pathlib import Path
import time
import tempfile
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID, uuid5

MAX_UPLOAD_BYTES = 16 * 1024 * 1024
ZONE_FIELDS = ("work_zone_id", "work_zone_version", "polygon")
SESSION_END_REASONS = {"operator_quit", "terminal_closed", "terminal_disconnected", "terminal_interrupted"}
GATEWAY_MANAGED = ".gateway-managed"
GATEWAY_EXITED = ".gateway-exited"
LOG_END_UNCONFIRMED = ".log-end-unconfirmed"


@dataclass(frozen=True)
class MissionArchive:
    data: bytes
    session_times: tuple[int, int] | None = None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def queue_lifecycle(spool: Path, signal: dict) -> None:
    kind = signal["kind"]
    if kind not in {"start", "end"}:
        return
    run_id = UUID(signal["runId"])
    folder = spool / str(run_id)
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = folder / f".lifecycle-{kind}.json"
    body = {key: signal[key] for key in ("id", "kind", "signalAt")}
    fd, temporary = tempfile.mkstemp(dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(body, output)
            output.flush()
            os.fsync(output.fileno())
        try:
            os.link(temporary, target)
        except FileExistsError:
            existing = json.loads(target.read_bytes())
            # 로그로 먼저 마감한 작업에는 뒤늦은 장비 확인으로 두 번째 이력 이벤트를 보내지 않는다.
            if existing["id"] == str(uuid5(run_id, f"cpp-session-{kind}")):
                return
            if any(existing[key] != body[key] for key in ("kind", "signalAt")):
                raise ValueError("이미 기록된 작업 신호와 시각이 다릅니다.")
    finally:
        Path(temporary).unlink()


def pack(source: Path, run_id: UUID, *, requested_zone: dict | None = None,
         unarmed_since_ms: int | None = None) -> MissionArchive | None:
    if unarmed_since_ms is not None and requested_zone is None:
        return None
    output = io.BytesIO()
    ended = False
    first = True
    log_start = first_permitted = last_step = None
    steps = 0
    with source.open("rb") as lines, gzip.GzipFile(fileobj=output, mode="wb", mtime=0) as compressed:
        for raw in lines:
            # 줄 단위로 쓰는 실행기가 아직 마지막 줄을 완성하지 않았다.
            if not raw.endswith(b"\n"):
                return None
            if not raw.strip():
                continue
            row = json.loads(raw)
            kind = row["type"]
            if ended:
                raise ValueError("종료 후 추가 로그가 있습니다.")
            if first:
                if kind != "run_start" or row.get("schema") != "mower.mission.log.v1":
                    raise ValueError("미션 시작 기록의 형식이 다릅니다.")
                if row.get("dry_run") is not False:
                    return None
                if row.get("server_run_id", str(run_id)) != str(run_id):
                    raise ValueError("로그의 작업 UUID가 폴더와 다릅니다.")
                if requested_zone is not None:
                    if row.get("work_zone") != {key: requested_zone[key] for key in ZONE_FIELDS}:
                        raise ValueError("로그의 작업 구역이 웹에서 준비한 구역과 다릅니다.")
                    log_start = row.get("started_at_unix_ms")
                    if type(log_start) is not int or log_start <= 0:
                        raise ValueError("로그 시작 시각이 유효하지 않습니다.")
                    if unarmed_since_ms is not None and log_start < unarmed_since_ms:
                        return None
                row["server_run_id"] = str(run_id)
                raw = json.dumps(row, ensure_ascii=False, allow_nan=False).encode("utf-8") + b"\n"
                first = False
            elif kind == "run_start":
                raise ValueError("여러 작업의 로그가 섞였습니다.")
            if kind == "step":
                steps += 1
            if requested_zone is not None and kind == "step":
                at = row.get("at_unix_ms")
                if type(at) is not int or at <= 0 or (last_step is not None and at < last_step):
                    raise ValueError("자율주행 판단 시각이 유효하지 않습니다.")
                last_step = at
                inputs = row.get("input")
                decision = inputs.get("decision_inputs") if isinstance(inputs, dict) else None
                command = row.get("actuator_command")
                if unarmed_since_ms is not None and (
                    at < log_start or not isinstance(decision, dict) or "permit" not in decision
                    or (decision["permit"] is not False and decision["permit"] is not None)
                    or not isinstance(command, dict) or command.get("output_topic") != "/mower_cpp/drive_cmd_vel"
                    or command.get("mode") != "stop"
                    or any(type(command.get(k)) not in (int, float) or command[k] != 0
                           for k in ("linear_mps", "angular_radps"))
                ):
                    return None
                if (first_permitted is None and at >= log_start
                        and isinstance(decision, dict) and decision.get("permit") is True
                        and isinstance(command, dict) and command.get("output_topic") == "/mower_cpp/drive_cmd_vel"
                        and type(command.get("timestamp_unix_ms")) is int and command["timestamp_unix_ms"] >= at):
                    first_permitted = at
            ended = kind == "run_end"
            compressed.write(raw)
            if output.tell() > MAX_UPLOAD_BYTES:
                raise ValueError("압축 로그가 업로드 한도를 초과합니다.")
    if not ended or not steps:
        return None
    if output.tell() > MAX_UPLOAD_BYTES:
        raise ValueError("압축 로그가 업로드 한도를 초과합니다.")
    if requested_zone is None:
        return MissionArchive(output.getvalue())
    end_at = row.get("ended_at_unix_ms")
    end_reason = row.get("ended_reason")
    if (unarmed_since_ms is None and first_permitted is None) or end_reason not in SESSION_END_REASONS:
        return None
    if (row.get("dry_run") is not False or row.get("started_at_unix_ms") != log_start or row.get("steps") != steps
            or type(end_at) is not int or not last_step <= end_at <= time.time_ns() // 1_000_000
            or json.loads(source.with_name("summary.json").read_bytes()) != {k: v for k, v in row.items() if k != "type"}):
        raise ValueError("로그 종료와 마감 요약이 일치하지 않습니다.")
    if unarmed_since_ms is not None:
        return MissionArchive(output.getvalue())
    return MissionArchive(output.getvalue(), (first_permitted, end_at))


def upload_pending(spool: Path, base: str, robot: str, token: str) -> None:
    opener = build_opener(NoRedirect())
    query = urlencode({"robotId": robot}, quote_via=quote)

    def send(path, data, content_type):
        request = Request(path, data=data, method="PUT", headers={"Content-Type": content_type,
                          "Authorization": "Bearer " + token})
        with opener.open(request, timeout=20) as response:
            if response.status != 204:
                raise ValueError(f"예상하지 못한 응답 상태 {response.status}")

    def send_lifecycle(folder, path, kinds=("start", "end")):
        for kind in kinds:
            event = folder / f".lifecycle-{kind}.json"
            sent = event.with_suffix(".sent")
            if event.is_file() and not sent.exists():
                send(f"{path}/lifecycle?{query}", event.read_bytes(), "application/json")
                sent.touch(exist_ok=True)

    for folder in sorted(spool.glob("*")):
        try:
            run_id = UUID(folder.name)
        except ValueError:
            continue
        if not folder.is_dir() or folder.is_symlink() or folder.name != str(run_id):
            continue
        marker = folder / ".uploaded"
        if marker.exists():
            continue
        managed = (folder / GATEWAY_MANAGED).is_file()
        exited = (folder / GATEWAY_EXITED).is_file()
        checking_log = False
        try:
            path = f"{base}/api/history/runs/{run_id}"
            send_lifecycle(folder, path, ("start",) if managed else ("start", "end"))
            if managed and not exited:
                continue
            checking_log = managed
            sources = list(folder.glob("session.*/mission-*/mission.jsonl"))
            if len(sources) != 1 or not sources[0].with_name("summary.json").is_file():
                if managed:
                    raise ValueError("실행이 종료됐지만 마감된 미션 로그가 하나로 확인되지 않습니다.")
                continue
            source = sources[0]
            zone_path = folder / "requested-work-zone.json"
            if managed and any(p.resolve() != folder.resolve() / p.relative_to(folder)
                               for p in (source, source.with_name("summary.json"), zone_path)):
                raise ValueError("작업 폴더 외부의 로그는 마감할 수 없습니다.")
            kinds = ("start", "end")
            signal_ids = {kind: str(uuid5(run_id, f"cpp-session-{kind}")) for kind in kinds}
            explicit_confirmation = False
            for kind in kinds:
                event = folder / f".lifecycle-{kind}.json"
                if ((folder / f".confirmed-{kind}.json").exists()
                        or event.is_file() and json.loads(event.read_bytes())["id"] != signal_ids[kind]):
                    explicit_confirmation = True
                    break
            validate_managed_log = managed or (zone_path.is_file() and not explicit_confirmation)
            zone = json.loads(zone_path.read_bytes()) if validate_managed_log else None
            if validate_managed_log and not isinstance(zone, dict):
                raise ValueError("웹에서 준비한 작업 구역의 형식이 다릅니다.")
            archive = pack(source, run_id, requested_zone=zone)
            if archive is None:
                if managed:
                    raise ValueError("구동 허용과 로그 마감이 확인된 세션이 아닙니다.")
                continue
            if archive.session_times is not None:
                if managed:
                    start_event = folder / ".lifecycle-start.json"
                    if start_event.is_file() and not (folder / ".lifecycle-end.json").is_file():
                        start_at = datetime.fromisoformat(json.loads(start_event.read_bytes())["signalAt"])
                        end_at = datetime.fromtimestamp(archive.session_times[1] / 1000, timezone.utc)
                        if start_at.tzinfo is None or start_at > end_at:
                            raise ValueError("작업 시작 보고가 로그 종료보다 늦습니다.")
                for kind, stamp in zip(kinds, archive.session_times):
                    if (folder / f".lifecycle-{kind}.json").is_file():
                        continue
                    at = datetime.fromtimestamp(stamp / 1000, timezone.utc).isoformat(timespec="milliseconds")
                    queue_lifecycle(spool, {"runId": str(run_id), "id": signal_ids[kind], "kind": kind, "signalAt": at})
                checking_log = False
                send_lifecycle(folder, path)
            send(f"{path}/replay?{query}", archive.data, "application/gzip")
            marker.touch(exist_ok=True)
        except (OSError, ValueError, KeyError, TypeError) as error:
            if checking_log:
                try:
                    (folder / LOG_END_UNCONFIRMED).touch()
                except OSError as marker_error:
                    print(f"작업 {run_id} 종료 상태 기록 보류: {marker_error}", flush=True)
            print(f"작업 {run_id} 업로드 보류: {error}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base-url", required=True)
    parser.add_argument("--robot-id", required=True)
    args = parser.parse_args()
    base = args.api_base_url.rstrip("/")
    url = urlsplit(base)
    token = os.environ.get("MOWER_MISSION_UPLOAD_TOKEN", "")
    spool = Path(os.environ.get("MOWER_MISSION_SPOOL", ""))
    if (url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment
            or url.path or not token.strip() or any(c in token for c in "\r\n") or not spool.is_absolute()):
        parser.error("HTTPS 서버 주소, MOWER_MISSION_SPOOL 절대 경로, MOWER_MISSION_UPLOAD_TOKEN이 필요합니다.")
    while True:
        upload_pending(spool, base, args.robot_id, token)
        time.sleep(30)


if __name__ == "__main__":
    main()
