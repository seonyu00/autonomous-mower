"""장비·ROS·MQTT에 접근하지 않는 실행 관리 검증용 가짜 프로그램이다."""
import argparse
import time

parser = argparse.ArgumentParser()
parser.add_argument("--seconds", type=float, default=30)
parser.add_argument("--exit-code", type=int, default=0)
args = parser.parse_args()
time.sleep(args.seconds)
raise SystemExit(args.exit_code)
