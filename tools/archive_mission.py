"""확인된 서버 작업 UUID에 종료된 Jetson 로그를 압축 등록한다."""
import argparse
import gzip
import json
import os
from pathlib import Path
import tempfile
from uuid import UUID


def archive(source: Path, run_id: UUID, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{run_id}.jsonl.gz"
    with source.open("rb") as stream, tempfile.NamedTemporaryFile(dir=directory, delete=False) as temp:
        staging = Path(temp.name)
        try:
            first = True
            ended = False
            with gzip.GzipFile(fileobj=temp, mode="wb", filename="", mtime=0) as compressed:
                for line in stream:
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    kind = row["type"]
                    if first and (kind != "run_start" or row.get("schema") != "mower.mission.log.v1"):
                        raise ValueError("미션 시작 기록을 확인해 주세요.")
                    if ended or (not first and kind == "run_start"):
                        raise ValueError("한 작업의 로그만 등록할 수 있습니다.")
                    first = False
                    ended = kind == "run_end"
                    compressed.write(line)
            if not ended:
                raise ValueError("종료 기록이 없는 파일입니다.")
            temp.close()
            os.link(staging, target)
        finally:
            temp.close()
            staging.unlink(missing_ok=True)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("run_id", type=UUID)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    print(archive(args.source, args.run_id, args.directory))
