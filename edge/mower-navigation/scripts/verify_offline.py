"""ROS와 장비 연결 없이 받은 CPP 모듈을 빌드하고 검증한다."""

import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cxx", default="g++", help="C++17 컴파일러 경로")
    parser.add_argument("--output", type=Path, help="검증 성공 후 서버용 CLI를 보관할 절대 경로")
    args = parser.parse_args()
    compiler = shutil.which(args.cxx)
    if compiler is None:
        parser.error(f"C++ 컴파일러를 찾을 수 없습니다: {args.cxx}")

    package = Path(__file__).resolve().parents[1] / "src" / "mower_map"
    sources = [package / "src" / name for name in ("grid_map.cpp", "coverage_planner.cpp")]
    # 임시 폴더에서만 빌드하며 ROS 토픽이나 시리얼 포트를 열지 않는다.
    with tempfile.TemporaryDirectory(prefix="mower-cpp-") as temporary:
        for name, entry in (
            ("grid_map_test", "tests/grid_map_test.cpp"),
            ("coverage_planner_test", "tests/coverage_planner_test.cpp"),
            ("cpp_map_cli", "tools/cpp_map_cli.cpp"),
        ):
            binary = Path(temporary) / (name + (".exe" if sys.platform == "win32" else ""))
            subprocess.run([
                compiler, "-std=c++17", "-Wall", "-Wextra", "-Wpedantic",
                "-UNDEBUG", "-I", str(package / "include"),
                *map(str, sources), str(package / entry), "-o", str(binary),
            ], check=True)
            if name == "cpp_map_cli":
                subprocess.run([sys.executable, str(package / "tests/cli_smoke_test.py"),
                                str(binary)], check=True)
            else:
                subprocess.run([str(binary)], check=True)
            print(f"PASS: {name}", flush=True)
            if name == "cpp_map_cli" and args.output:
                if not args.output.is_absolute():
                    parser.error("--output에는 절대 경로를 지정하세요.")
                args.output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(binary, args.output)
                print(f"CLI: {args.output}", flush=True)


if __name__ == "__main__":
    main()
