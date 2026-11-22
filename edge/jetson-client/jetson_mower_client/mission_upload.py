"""작업별 r60 로그를 압축해 종료가 확인된 서버 작업에 전송한다."""
from __future__ import annotations

import argparse
import gzip
import io
import json
import os
from pathlib import Path
import time
import tempfile
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID

MAX_UPLOAD_BYTES = 16 * 1024 * 1024


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
            if any(existing[key] != body[key] for key in ("kind", "signalAt")):
                raise ValueError("이미 기록된 작업 신호와 시각이 다릅니다.")
    finally:
        Path(temporary).unlink()


def pack(source: Path, run_id: UUID) -> bytes | None:
    output = io.BytesIO()
    ended = False
    first = True
    has_step = False
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
                row["server_run_id"] = str(run_id)
                raw = json.dumps(row, ensure_ascii=False, allow_nan=False).encode("utf-8") + b"\n"
                first = False
            elif kind == "run_start":
                raise ValueError("여러 작업의 로그가 섞였습니다.")
            has_step |= kind == "step"
            ended = kind == "run_end"
            compressed.write(raw)
            if output.tell() > MAX_UPLOAD_BYTES:
                raise ValueError("압축 로그가 업로드 한도를 초과합니다.")
    if not ended or not has_step:
        return None
    if output.tell() > MAX_UPLOAD_BYTES:
        raise ValueError("압축 로그가 업로드 한도를 초과합니다.")
    return output.getvalue()


def upload_pending(spool: Path, base: str, robot: str, token: str) -> None:
    opener = build_opener(NoRedirect())
    query = urlencode({"robotId": robot}, quote_via=quote)

    def send(path, data, content_type):
        request = Request(path, data=data, method="PUT", headers={"Content-Type": content_type,
                          "Authorization": "Bearer " + token})
        with opener.open(request, timeout=20) as response:
            if response.status != 204:
                raise ValueError(f"예상하지 못한 응답 상태 {response.status}")

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
        try:
            path = f"{base}/api/history/runs/{run_id}"
            for kind in ("start", "end"):
                event = folder / f".lifecycle-{kind}.json"
                sent = event.with_suffix(".sent")
                if event.is_file() and not sent.exists():
                    send(f"{path}/lifecycle?{query}", event.read_bytes(), "application/json")
                    sent.touch(exist_ok=True)
            sources = list(folder.glob("session.*/mission-*/mission.jsonl"))
            if len(sources) != 1 or not sources[0].with_name("summary.json").is_file():
                continue
            source = sources[0]
            compressed = pack(source, run_id)
            if compressed is None:
                continue
            send(f"{path}/replay?{query}", compressed, "application/gzip")
            marker.touch(exist_ok=True)
        except (OSError, ValueError, KeyError, TypeError) as error:
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
