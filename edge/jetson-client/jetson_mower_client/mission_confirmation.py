"""이미 확인한 장비 작업 이벤트를 실행 관리자에게 전달한다."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
from uuid import UUID


def publish_confirmation(kind: str, signal_at: str) -> None:
    run_id = str(UUID(os.environ.get("MOWER_RUN_ID", "")))
    directory = Path(os.environ.get("MOWER_PREVIEW_LOG_DIR", ""))
    if not directory.is_absolute() or directory.name != run_id:
        raise ValueError("실행 관리자가 전달한 작업 폴더가 필요합니다.")
    stamp = datetime.fromisoformat(signal_at.replace("Z", "+00:00"))
    if kind not in {"start", "end"} or stamp.tzinfo is None or stamp > datetime.now(timezone.utc):
        raise ValueError("확인된 시작·종료 종류와 시각을 입력해 주세요.")
    event = {"runId": run_id, "kind": kind, "signalAt": stamp.astimezone(timezone.utc).isoformat()}
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = directory / f".confirmed-{kind}.json"
    fd, temporary = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(event, stream)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, target)
        except FileExistsError:
            if json.loads(target.read_bytes()) != event:
                raise ValueError("다른 시각의 동일 작업 확인이 이미 있습니다.")
    finally:
        Path(temporary).unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("start", "end"))
    parser.add_argument("signal_at")
    args = parser.parse_args()
    publish_confirmation(args.kind, args.signal_at)
