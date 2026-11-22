"""기존 압축 영상 토픽을 저주기 JPEG로 저장한다. 카메라 장치를 새로 열지 않는다."""
import argparse
import json
import os
from pathlib import Path
import time


def save_frame(directory, payload, capture_ns, now, previous):
    if now - previous < .5 or not payload.startswith(b'\xff\xd8') or len(payload) > 4 * 1024 * 1024:
        return previous
    temporary = directory / 'camera.tmp'
    temporary.write_bytes(payload)
    os.replace(temporary, directory / 'camera.jpg')
    temporary = directory / 'camera-meta.tmp'
    temporary.write_text(json.dumps({'capture_unix_ms': capture_ns // 1_000_000,
                                     'received_at': time.time()}))
    os.replace(temporary, directory / 'camera.json')
    return now


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    import rclpy
    from rclpy.qos import qos_profile_sensor_data
    from sensor_msgs.msg import CompressedImage
    rclpy.init(args=[])
    node = rclpy.create_node('cpp_camera_preview')
    previous = float('-inf')

    def receive(message):
        nonlocal previous
        stamp = message.header.stamp
        previous = save_frame(args.directory, bytes(message.data),
                              stamp.sec * 1_000_000_000 + stamp.nanosec,
                              time.monotonic(), previous)

    node.create_subscription(CompressedImage, '/camera/camera/color/image_raw/compressed',
                             receive, qos_profile_sensor_data)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
