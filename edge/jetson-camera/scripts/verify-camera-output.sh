#!/usr/bin/env bash

set -eo pipefail

ROS_SETUP="${ROS_SETUP:-/opt/ros/humble/setup.bash}"
MOWER_SETUP="${MOWER_SETUP:-$HOME/mower_ws/install/setup.bash}"
EXPECTED_WIDTH=640
EXPECTED_HEIGHT=480
MIN_HZ=12
MAX_HZ=18
SAMPLE_COUNT=10
TIMEOUT_SECONDS=20

for required_file in "$ROS_SETUP" "$MOWER_SETUP"; do
  if [[ ! -f "$required_file" ]]; then
    echo "필수 ROS setup 파일을 찾을 수 없습니다: $required_file" >&2
    exit 1
  fi
done

if ! lsusb | grep -qi -E "Intel.*RealSense|RealSense.*Intel"; then
  echo "FAIL: Intel RealSense USB 장치를 찾을 수 없습니다." >&2
  exit 1
fi

source "$ROS_SETUP"
source "$MOWER_SETUP"
set -u

if ! ros2 node list | grep -qx "/camera/camera"; then
  echo "FAIL: /camera/camera 노드가 실행 중이지 않습니다." >&2
  exit 1
fi

export EXPECTED_WIDTH EXPECTED_HEIGHT MIN_HZ MAX_HZ SAMPLE_COUNT TIMEOUT_SECONDS

python3 - <<'PY'
import os
import sys
import time

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage, Image


EXPECTED_WIDTH = int(os.environ["EXPECTED_WIDTH"])
EXPECTED_HEIGHT = int(os.environ["EXPECTED_HEIGHT"])
MIN_HZ = float(os.environ["MIN_HZ"])
MAX_HZ = float(os.environ["MAX_HZ"])
SAMPLE_COUNT = int(os.environ["SAMPLE_COUNT"])
TIMEOUT_SECONDS = float(os.environ["TIMEOUT_SECONDS"])


class CameraVerifier(Node):
    def __init__(self) -> None:
        super().__init__("camera_output_verifier")
        self.raw_times = []
        self.raw_message = None
        self.compressed_message = None
        self.create_subscription(
            Image,
            "/camera/camera/color/image_raw",
            self.on_raw,
            10,
        )
        self.create_subscription(
            CompressedImage,
            "/camera/camera/color/image_raw/compressed",
            self.on_compressed,
            10,
        )

    def on_raw(self, message: Image) -> None:
        self.raw_message = message
        if len(self.raw_times) < SAMPLE_COUNT:
            self.raw_times.append(time.monotonic())

    def on_compressed(self, message: CompressedImage) -> None:
        if "jpeg" in message.format.lower() and len(message.data) > 0:
            self.compressed_message = message

    def complete(self) -> bool:
        return (
            len(self.raw_times) >= SAMPLE_COUNT
            and self.compressed_message is not None
            and len(self.compressed_message.data) > 0
        )


rclpy.init()
node = CameraVerifier()
deadline = time.monotonic() + TIMEOUT_SECONDS

try:
    while time.monotonic() < deadline and not node.complete():
        rclpy.spin_once(node, timeout_sec=0.5)

    failures = []
    raw_message = node.raw_message
    compressed_message = node.compressed_message

    if raw_message is None:
        failures.append("원본 컬러 메시지를 수신하지 못했습니다.")
    else:
        if raw_message.width != EXPECTED_WIDTH or raw_message.height != EXPECTED_HEIGHT:
            failures.append(
                f"원본 해상도가 {raw_message.width}x{raw_message.height}입니다. "
                f"기대값은 {EXPECTED_WIDTH}x{EXPECTED_HEIGHT}입니다."
            )

    measured_hz = 0.0
    if len(node.raw_times) >= 2:
        duration = node.raw_times[-1] - node.raw_times[0]
        if duration > 0:
            measured_hz = (len(node.raw_times) - 1) / duration
    if not MIN_HZ <= measured_hz <= MAX_HZ:
        failures.append(
            f"원본 발행 주기가 {measured_hz:.2f}Hz입니다. "
            f"허용 범위는 {MIN_HZ:.0f}~{MAX_HZ:.0f}Hz입니다."
        )

    if compressed_message is None:
        failures.append("압축 컬러 메시지를 수신하지 못했습니다.")
    else:
        if "jpeg" not in compressed_message.format.lower():
            failures.append(f"압축 형식이 JPEG가 아닙니다: {compressed_message.format}")
        if len(compressed_message.data) == 0:
            failures.append("압축 JPEG payload가 비어 있습니다.")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        raise SystemExit(1)

    print("PASS: Intel RealSense D455 USB 장치를 확인했습니다.")
    print(
        f"PASS: 원본 컬러 출력 {raw_message.width}x{raw_message.height}, "
        f"{measured_hz:.2f}Hz를 확인했습니다."
    )
    print(
        f"PASS: 압축 컬러 출력 {compressed_message.format}, "
        f"{len(compressed_message.data)}바이트를 확인했습니다."
    )
finally:
    node.destroy_node()
    rclpy.shutdown()
PY
