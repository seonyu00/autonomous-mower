#!/usr/bin/env bash
set -eo pipefail
# 비전용 NumPy가 기존 ROS 변환 패키지를 덮어쓰지 않도록 센서 환경을 분리한다.
unset PYTHONPATH
source /opt/ros/humble/setup.bash
set -u
client_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PYTHONPATH="${client_dir}:${PYTHONPATH:-}"
for device in /dev/gps_main /dev/gps_aux; do
  while [[ ! -e "$device" ]]; do sleep 1; done
done
exec python3 -B -m jetson_mower_client.dual_gps_node
