"""듀얼 GPS와 장애물 스냅샷을 CPP 미리보기용 JSONL 입력으로 변환한다."""

import argparse
from collections import OrderedDict
import json
import math
import os
import sys
import time


class CppSensorInput:
    def __init__(self):
        self.fixes = OrderedDict()
        self.headings = OrderedDict()
        self.ready = False
        self.ready_received = None
        self.obstacles = {}

    @staticmethod
    def remember(cache, stamp_ns, value, received):
        # 같은 측정의 재전송으로 수신 수명을 늘리지 않는다.
        if stamp_ns not in cache:
            cache[stamp_ns] = (value, received)
            while len(cache) > 8:
                cache.popitem(last=False)
        elif cache[stamp_ns][0] != value:
            cache.clear()

    def fix(self, stamp_ns, latitude, longitude, covariance, covariance_type, status, received):
        try:
            if (status < 0 or covariance_type == 0 or len(covariance) != 9
                    or not all(math.isfinite(v) and v >= 0 for v in (covariance[0], covariance[4]))
                    or not math.isfinite(latitude) or not math.isfinite(longitude)
                    or not -85 <= latitude <= 85 or not -180 <= longitude <= 180):
                raise ValueError()
            sigma = math.sqrt(max(covariance[0], covariance[4]))
            self.remember(self.fixes, stamp_ns, (latitude, longitude, sigma), received)
        except (ValueError, TypeError, IndexError):
            self.fixes.clear()

    def heading(self, stamp_ns, quaternion, received):
        try:
            x, y, z, w = quaternion
            norm = sum(v * v for v in quaternion)
            if not all(math.isfinite(v) for v in quaternion) or abs(norm - 1) > .01:
                raise ValueError()
            yaw = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
            self.remember(self.headings, stamp_ns, yaw, received)
        except (ValueError, TypeError):
            self.headings.clear()

    def readiness(self, valid, received):
        self.ready = valid is True
        self.ready_received = received
        if not self.ready:
            self.fixes.clear()
            self.headings.clear()

    def snapshot(self, payload):
        try:
            if len(payload.encode('utf-8')) > 2 * 1024 * 1024:
                raise ValueError()
            value = json.loads(payload, parse_constant=lambda _: None)
            if not isinstance(value, dict) or value.get('schema') != 'mower.obstacles.v1':
                raise ValueError()
            # 촬영 시각·세션·구역 버전을 보충하지 않고 원본 관측을 전달한다.
            self.obstacles = value
        except (ValueError, TypeError, AttributeError):
            self.obstacles = {}

    def event(self, now_ns, monotonic_s):
        pose = {'valid': False, 'yaw_ready': False}
        reason = 'dual_gps_unavailable'
        paired = sorted(self.fixes.keys() & self.headings.keys())
        if (self.ready and self.ready_received is not None
                and 0 <= monotonic_s - self.ready_received < 3 and paired):
            stamp = paired[-1]
            (lat, lon, sigma), fix_received = self.fixes[stamp]
            yaw, yaw_received = self.headings[stamp]
            previous = [s for s in self.headings if 0 < stamp - s <= 1_500_000_000]
            fresh = (0 <= now_ns - stamp <= 500_000_000
                     and 0 <= monotonic_s - fix_received <= .5
                     and 0 <= monotonic_s - yaw_received <= .5)
            reason = 'pose_stale' if not fresh else 'heading_rate_unavailable'
            if fresh and previous:
                old_stamp = max(previous)
                old_yaw = self.headings[old_stamp][0]
                delta = math.atan2(math.sin(yaw - old_yaw), math.cos(yaw - old_yaw))
                pose.update(lat=lat, lon=lon, timestamp_unix_ms=stamp // 1_000_000,
                            yaw_timestamp_unix_ms=stamp // 1_000_000,
                            yaw_enu_rad=yaw, yaw_rate_radps=delta / ((stamp - old_stamp) / 1e9),
                            position_uncertainty_m=sigma,
                            valid=sigma <= .10, yaw_ready=True)
                reason = 'ready' if pose['valid'] else 'position_uncertain'
        return {'pose': pose, 'obstacle_snapshot': self.obstacles,
                'cutting': False, 'motion_preview_enabled': False,
                'adapter': {'status': reason, 'dry_run': True,
                            'yaw_rate_source': 'dual_gps_difference_preview_only'}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--obstacle-topic', default='/drive_test/obstacle_snapshot')
    args = parser.parse_args()
    # 표준 출력은 JSONL 전용으로 사용하고 ROS 진단은 표준 오류로 보낸다.
    os.environ['RCUTILS_LOGGING_USE_STDOUT'] = '0'
    import rclpy
    from nav_msgs.msg import Odometry
    from rclpy.qos import qos_profile_sensor_data
    from sensor_msgs.msg import NavSatFix
    from std_msgs.msg import Bool, String

    def stamp(message):
        return message.header.stamp.sec * 1_000_000_000 + message.header.stamp.nanosec

    rclpy.init(args=[])
    node = rclpy.create_node('cpp_sensor_input_preview')
    inputs = CppSensorInput()

    def fix(message):
        inputs.fix(stamp(message), message.latitude, message.longitude,
                   message.position_covariance, message.position_covariance_type,
                   message.status.status, time.monotonic())

    def heading(message):
        q = message.pose.pose.orientation
        inputs.heading(stamp(message), (q.x, q.y, q.z, q.w), time.monotonic())

    def emit():
        print(json.dumps(inputs.event(time.time_ns(), time.monotonic()), allow_nan=False), flush=True)

    node.create_subscription(NavSatFix, '/dual_gps/fix', fix, qos_profile_sensor_data)
    node.create_subscription(Odometry, '/dual_gps/odom', heading, qos_profile_sensor_data)
    node.create_subscription(Bool, '/dual_gps/yaw_ready',
                             lambda msg: inputs.readiness(msg.data, time.monotonic()), 10)
    node.create_subscription(String, args.obstacle_topic, lambda msg: inputs.snapshot(msg.data), 1)
    node.create_timer(.2, emit)
    print('CPP 미리보기 입력 전용: 주행·시리얼·날 제어 출력 없음', file=sys.stderr)
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, BrokenPipeError):
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
