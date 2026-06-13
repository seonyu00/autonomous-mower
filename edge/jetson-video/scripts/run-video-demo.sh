#!/usr/bin/env bash

set -eo pipefail

ROS_SETUP="${ROS_SETUP:-/opt/ros/humble/setup.bash}"
MOWER_SETUP="${MOWER_SETUP:-$HOME/mower_ws/install/setup.bash}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPOSITORY_DIR="$(cd "$PROJECT_DIR/../.." && pwd)"
CAMERA_SCRIPT="${CAMERA_SCRIPT:-$REPOSITORY_DIR/edge/jetson-camera/scripts/run-realsense-camera.sh}"
MEDIAMTX_SCRIPT="${MEDIAMTX_SCRIPT:-$SCRIPT_DIR/run-mediamtx.sh}"
STREAMER_SCRIPT="${STREAMER_SCRIPT:-$SCRIPT_DIR/run-video-streamer.sh}"
IMAGE_TOPIC="${IMAGE_TOPIC:-/camera/camera/color/image_raw}"
MEDIAMTX_API_URL="${MEDIAMTX_API_URL:-http://127.0.0.1:9997/v3/paths/list}"
STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-40}"

for required_file in \
  "$ROS_SETUP" \
  "$MOWER_SETUP" \
  "$CAMERA_SCRIPT" \
  "$MEDIAMTX_SCRIPT" \
  "$STREAMER_SCRIPT"; do
  if [[ ! -f "$required_file" ]]; then
    echo "필수 파일을 찾을 수 없습니다: $required_file" >&2
    exit 1
  fi
done

if ! command -v curl >/dev/null 2>&1; then
  echo "MediaMTX 준비 상태 확인에 필요한 curl을 찾을 수 없습니다." >&2
  exit 1
fi

source "$ROS_SETUP"
source "$MOWER_SETUP"
set -u

camera_pid=""
mediamtx_pid=""
streamer_pid=""

cleanup() {
  trap - EXIT INT TERM
  for child_pid in "$streamer_pid" "$mediamtx_pid" "$camera_pid"; do
    if [[ -n "$child_pid" ]] && kill -0 -- "-$child_pid" 2>/dev/null; then
      kill -- "-$child_pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

wait_for_camera() {
  for _ in $(seq 1 "$STARTUP_TIMEOUT_SECONDS"); do
    if ros2 topic info "$IMAGE_TOPIC" 2>/dev/null | grep -q "Publisher count: [1-9]"; then
      return 0
    fi
    if ! kill -0 "$camera_pid" 2>/dev/null; then
      echo "카메라 프로세스가 준비 전에 종료됐습니다." >&2
      return 1
    fi
    sleep 1
  done

  echo "제한 시간 안에 카메라 영상 토픽이 준비되지 않았습니다: $IMAGE_TOPIC" >&2
  return 1
}

wait_for_mediamtx() {
  for _ in $(seq 1 "$STARTUP_TIMEOUT_SECONDS"); do
    if curl --fail --silent --output /dev/null "$MEDIAMTX_API_URL"; then
      return 0
    fi
    if ! kill -0 "$mediamtx_pid" 2>/dev/null; then
      echo "MediaMTX 프로세스가 준비 전에 종료됐습니다." >&2
      return 1
    fi
    sleep 1
  done

  echo "제한 시간 안에 MediaMTX API가 준비되지 않았습니다: $MEDIAMTX_API_URL" >&2
  return 1
}

echo "[1/3] RealSense 카메라를 시작합니다."
setsid "$CAMERA_SCRIPT" &
camera_pid=$!
wait_for_camera

echo "[2/3] MediaMTX를 시작합니다."
setsid "$MEDIAMTX_SCRIPT" &
mediamtx_pid=$!
wait_for_mediamtx

echo "[3/3] NVENC 영상 송출기를 시작합니다."
setsid "$STREAMER_SCRIPT" &
streamer_pid=$!

echo "영상 시연 스택이 실행 중입니다. 종료하려면 Ctrl+C를 누르세요."
wait -n "$camera_pid" "$mediamtx_pid" "$streamer_pid"
