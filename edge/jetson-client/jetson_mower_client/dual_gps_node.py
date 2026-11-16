"""듀얼 GPS 수신기. 주 위치와 검증된 방향을 제공하며 구동 명령은 발행하지 않는다."""

import argparse
import json
import math
import time
from datetime import datetime, timezone

from .dual_gps_heading import heading_enu_rad
from .dual_gps_nmea import NmeaEpochs, fields


ROS_ARGUMENTS = ['dual_gps', '--ros-args', '-r', '__node:=dual_gps_input',
                 '-r', 'vel:=/dual_gps/vel', '-r', 'heading:=/dual_gps/nmea_heading',
                 '-r', 'time_reference:=/dual_gps/time_reference']


def main():
    import rclpy
    import serial
    from libnmea_navsat_driver.driver import Ros2NMEADriver
    from nav_msgs.msg import Odometry
    from sensor_msgs.msg import NavSatFix
    from rclpy.qos import QoSProfile, DurabilityPolicy
    from std_msgs.msg import Bool, String

    parser = argparse.ArgumentParser(description=__doc__)
    # 기존 udev 별칭과 실제 전·후 안테나 역할이 반대여서 입력 역할을 교환한다.
    parser.add_argument('--main-port', default='/dev/gps_aux')
    parser.add_argument('--aux-port', default='/dev/gps_main')
    args = parser.parse_args()
    rclpy.init(args=ROS_ARGUMENTS)
    node = Ros2NMEADriver()
    ready_pub = node.create_publisher(Bool, '/dual_gps/yaw_ready', QoSProfile(
        depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL))
    odom_pub = node.create_publisher(Odometry, '/dual_gps/odom', 10)
    status_pub = node.create_publisher(String, '/dual_gps/status', 10)
    strict_fix_pub = node.create_publisher(NavSatFix, '/dual_gps/fix', 10)
    main_fix_pub = node.create_publisher(NavSatFix, '/dual_gps/main_fix', 10)
    main_messages = {}

    def main_fix_received(message):
        if message.header.frame_id != 'gps_main':
            return
        timestamp = message.header.stamp.sec * 1_000_000_000 + message.header.stamp.nanosec
        main_messages[timestamp] = message
        while len(main_messages) > 4:
            del main_messages[next(iter(main_messages))]
        # 위치 표시와 듀얼 방향의 유효성은 별개다. 일반 GPS 위치도 기존 관제에 전달한다.
        main_fix_pub.publish(message)

    # 드라이버의 기본 /fix는 그대로 두어 별칭 발행이 remap으로 자기 자신에게 돌아가지 않게 한다.
    node.create_subscription(NavSatFix, '/fix', main_fix_received, 10)
    ports = []
    epochs = [NmeaEpochs(), NmeaEpochs()]
    fixes = [None, None]
    buffers = [b'', b'']
    last_pair = None
    last_good = None
    last_heading = None
    last_heading_at = None
    qualities = [None, None]
    reason = '양쪽 GPS 측정 대기'
    try:
        for path in (args.main_port, args.aux_port):
            ports.append(serial.Serial(path, 115200, timeout=0, exclusive=True))
        node.get_logger().info('시험용 듀얼 GPS: 전방 기준선 0.43m, 구동 출력 없음')
        last_status = 0
        while rclpy.ok():
            for index, port in enumerate(ports):
                buffers[index] += port.read(4096)
                if len(buffers[index]) > 16384:
                    buffers[index] = b''
                    fixes[index] = None
                    last_good = None
                    reason = 'GPS 문장 버퍼 초과'
                while b'\n' in buffers[index]:
                    line, buffers[index] = buffers[index].split(b'\n', 1)
                    try:
                        raw = line.decode('ascii').strip()
                        parts = fields(raw)
                        if index == 0 and parts[0].endswith('GST'):
                            node.add_sentence(raw, 'gps_main')
                        if parts[0].endswith('GGA'):
                            qualities[index] = int(parts[6] or 0)
                            if int(parts[6] or 0) != 4:
                                fixes[index] = None
                                last_good = None
                                reason = '양쪽 RTK Fixed 필요'
                        result = epochs[index].add(raw, time.monotonic(), time.time())
                        if result:
                            fixes[index] = result
                            if index == 0:
                                stamp = rclpy.time.Time(seconds=result[0].measured_at_s).to_msg()
                                node.add_sentence(result[1], 'gps_main', timestamp=stamp)
                    except (ValueError, IndexError, UnicodeError):
                        # 이전 정상 상태를 새 관측처럼 계속 유지하지 않는다.
                        fixes[index] = None
                        last_good = None
                        reason = 'NMEA 무효·측정 만료 또는 시각 불일치'
            now = time.monotonic()
            if all(fixes):
                a, b = fixes[0][0], fixes[1][0]
                pair = (a.measured_at_s, b.measured_at_s)
                main_ns = rclpy.time.Time(seconds=a.measured_at_s).nanoseconds
                if pair != last_pair and main_ns in main_messages:
                    try:
                        yaw = heading_enu_rad(a, b, now_monotonic_s=now,
                                              baseline_m=.43, baseline_tolerance_m=.05,
                                              main_to_aux_body_rad=0, max_age_s=3,
                                              max_time_difference_s=0)
                        stamp = rclpy.time.Time(seconds=a.measured_at_s).to_msg()
                        # 설치된 드라이버의 GST 또는 품질별 근사 공분산을 보존한다.
                        # Fixed 상태만으로 위치 오차를 실측했다고 주장하지 않는다.
                        strict_fix_pub.publish(main_messages[main_ns])
                        odom = Odometry()
                        odom.header.stamp = stamp
                        odom.header.frame_id = 'dual_gps_enu'
                        odom.child_frame_id = 'mower_heading_only'
                        odom.pose.pose.orientation.z = math.sin(yaw / 2)
                        odom.pose.pose.orientation.w = math.cos(yaw / 2)
                        # 위치는 /dual_gps/fix를 사용한다. 이 메시지는 방향 전달 전용이다.
                        odom.pose.covariance[0] = odom.pose.covariance[7] = 1e6
                        odom.pose.covariance[35] = 1e6
                        odom_pub.publish(odom)
                        last_good = min(a.received_monotonic_s, b.received_monotonic_s)
                        last_pair = pair
                        last_heading = (90 - math.degrees(yaw)) % 360
                        last_heading_at = datetime.fromtimestamp(a.measured_at_s, timezone.utc).isoformat()
                        reason = 'Fixed·동일 측정 시각·기준선 검사 통과'
                    except ValueError as error:
                        # 1Hz 두 수신기의 도착 순서 차이는 유효 입력으로 대기한다.
                        # 서로 다른 시각의 위치를 혼합해 방향을 새로 발행하지 않는다.
                        reason = str(error)
                        if a.measured_at_s == b.measured_at_s or abs(a.measured_at_s - b.measured_at_s) > 1:
                            last_good = None
            valid = last_good is not None and 0 <= now - last_good < 3
            if now - last_status >= .2:
                ready_pub.publish(Bool(data=valid))
                status_pub.publish(String(data=json.dumps({
                    'valid': valid, 'reason': reason if valid or last_good is None else 'GPS 수신 만료',
                    'source': 'dual_gps_fixed_baseline', 'baseline_m': .43,
                    'baseline_tolerance_m': .05, 'measurement_age_limit_s': 3,
                    'main_quality': qualities[0], 'aux_quality': qualities[1],
                    'headingDegrees': last_heading if valid else None,
                    'headingObservedAt': last_heading_at if valid else None,
                    'position_covariance_source': 'receiver_gst' if node.using_receiver_epe else 'nmea_driver_approximation',
                    'notice': '시험 지도 전용; 방향 정확도와 주행 적합성 미검증'}, ensure_ascii=False)))
                last_status = now
            rclpy.spin_once(node, timeout_sec=0)
            time.sleep(.01)
    except KeyboardInterrupt:
        pass
    finally:
        ready_pub.publish(Bool(data=False))
        for port in ports:
            port.close()
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
