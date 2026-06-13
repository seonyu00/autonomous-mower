#!/usr/bin/env bash

set -eo pipefail

ROS_SETUP="${ROS_SETUP:-/opt/ros/humble/setup.bash}"
MOWER_SETUP="${MOWER_SETUP:-$HOME/mower_ws/install/setup.bash}"
REALSENSE_LIBRARY="${REALSENSE_LIBRARY:-/usr/local/lib/librealsense2.so.2.57.6}"

for required_file in "$ROS_SETUP" "$MOWER_SETUP" "$REALSENSE_LIBRARY"; do
  if [[ ! -f "$required_file" ]]; then
    echo "필수 파일을 찾을 수 없습니다: $required_file" >&2
    exit 1
  fi
done

if ! lsusb | grep -qi -E "Intel.*RealSense|RealSense.*Intel"; then
  echo "Intel RealSense USB 장치를 찾을 수 없습니다." >&2
  exit 1
fi

source "$ROS_SETUP"
source "$MOWER_SETUP"
set -u

camera_pid=""
republisher_pid=""

cleanup() {
  trap - EXIT INT TERM
  for child_pid in "$republisher_pid" "$camera_pid"; do
    if [[ -n "$child_pid" ]] && kill -0 -- "-$child_pid" 2>/dev/null; then
      kill -- "-$child_pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

setsid env LD_PRELOAD="$REALSENSE_LIBRARY${LD_PRELOAD:+:$LD_PRELOAD}" \
ros2 launch realsense2_camera rs_launch.py \
  align_depth.enable:=true \
  pointcloud.enable:=false \
  enable_gyro:=false \
  enable_accel:=false \
  initial_reset:=true \
  rgb_camera.color_profile:=640,480,15 \
  depth_module.depth_profile:=640,480,15 &
camera_pid=$!

camera_ready=false
for _ in $(seq 1 40); do
  if ros2 param set \
    /camera/camera \
    camera.color.image_raw.enable_pub_plugins \
    "['image_transport/raw']" >/dev/null 2>&1; then
    camera_ready=true
    break
  fi
  if ! kill -0 "$camera_pid" 2>/dev/null; then
    wait "$camera_pid"
  fi
  sleep 1
done

if [[ "$camera_ready" != true ]]; then
  echo "제한 시간 안에 /camera/camera 노드가 시작되지 않았습니다." >&2
  exit 1
fi

# 현재 Jetson의 RealSense 프로세스 내부 compressed plugin은
# 빈 JPEG를 발행하므로 raw publisher만 유지하고 별도 프로세스에서 압축한다.
setsid ros2 run image_transport republish \
  raw in:=/camera/camera/color/image_raw \
  compressed out/compressed:=/camera/camera/color/image_raw/compressed &
republisher_pid=$!

wait -n "$camera_pid" "$republisher_pid"
