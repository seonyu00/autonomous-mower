#!/usr/bin/env bash

set -eo pipefail

ROS_SETUP="${ROS_SETUP:-/opt/ros/humble/setup.bash}"
MOWER_SETUP="${MOWER_SETUP:-$HOME/mower_ws/install/setup.bash}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_PATH="${1:-$PROJECT_DIR/config.yaml}"

for required_file in "$ROS_SETUP" "$MOWER_SETUP" "$CONFIG_PATH"; do
  if [[ ! -f "$required_file" ]]; then
    echo "필수 파일을 찾을 수 없습니다: $required_file" >&2
    exit 1
  fi
done

source "$ROS_SETUP"
source "$MOWER_SETUP"
set -u

export PYTHONPATH="$PROJECT_DIR:${PYTHONPATH:-}"
exec python3 -m jetson_video_streamer --config "$CONFIG_PATH"
