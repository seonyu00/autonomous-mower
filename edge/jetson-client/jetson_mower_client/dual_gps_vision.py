"""팀원 기록기를 보존하면서 듀얼 GPS 전역 지도 시험을 별도로 실행한다."""

import argparse
from pathlib import Path
import sys
import time
import uuid

from .vision_web_bridge import observation_plan
from .web_work_zone import fetch, prepare


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--team-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--semantic-model', type=Path, required=True)
    parser.add_argument('--api-base-url', required=True)
    parser.add_argument('--robot-id', required=True)
    parser.add_argument('--expected-version', required=True, type=int)
    args = parser.parse_args()
    import os
    import json
    prepared = prepare(fetch(args.api_base_url, args.robot_id, os.environ.get('WORK_ZONE_API_TOKEN', '')),
                       args.robot_id, args.expected_version)
    work_plan = observation_plan(prepared)
    session_id = str(uuid.uuid4())
    sys.path.insert(0, str(args.team_dir.resolve()))
    from recorder import Recorder, stamp
    from temporal_map import StaticTreeMap, Policy
    import rclpy

    class WorkZoneMap(StaticTreeMap):
        def update(self, **arguments):
            # 팀원 기록기의 임시 식별자를 이 실행에 고정한 서버 구역 버전으로 치환한다.
            arguments['work_zone_version'] = self.plan['work_zone_version']
            return super().update(**arguments)

    class DualRecorder(Recorder):
        def __init__(self):
            self.dual_fixes = []
            super().__init__(str(args.output), 1., semantic_model=str(args.semantic_model))
            self.mapper = WorkZoneMap(work_plan, Policy(max_sensor_latency_s=2.5,
                max_pose_uncertainty_m=self.max_sigma, retain_semantic_static=True))
            self.first_fix = work_plan['origin']
            (args.output / 'work-zone.json').write_text(json.dumps(prepared), encoding='utf-8')
            self.create_timer(.05, self.drain_dual_fixes)

        def fix_cb(self, message):
            self.dual_fixes.append((time.monotonic(), message))
            self.dual_fixes = self.dual_fixes[-8:]

        def ready_cb(self, message):
            super().ready_cb(message)
            if not message.data:
                self.yaws.clear()
                self.dual_fixes.clear()
                self.status.update(state='pose_unavailable', yaw_ready=False,
                                   reason=['dual_gps_direction_invalid'])

        def drain_dual_fixes(self):
            # 서로 다른 토픽의 도착 순서와 무관하게 같은 측정의 위치·방향을 결합한다.
            remaining = []
            for received, message in self.dual_fixes:
                if time.monotonic() - received >= 3:
                    continue
                ts = stamp(message)
                if (self.ready and any(yaw_ts == ts for yaw_ts, _ in self.yaws)
                        and any(abs(imu_ts - ts) <= 400_000_000 for imu_ts, _ in self.imus)):
                    super().fix_cb(message)
                else:
                    remaining.append((received, message))
            self.dual_fixes = remaining

        def write_state(self):
            if self.ready_wall is None or time.monotonic() - self.ready_wall >= 3:
                self.ready = False
                self.status.update(state='pose_unavailable', yaw_ready=False,
                                   reason=['dual_gps_status_stale'])
            self.status['heading_source'] = 'dual_gps_fixed_baseline'
            self.status['baseline_m'] = .43
            self.status['position_reference'] = 'main_antenna_near_vehicle_center'
            self.status['accuracy_notice'] = '공분산은 GPS 드라이버 추정; 현장 위치 정확도 미검증'
            self.status.update(zoneVersion=prepared['version'], zoneId=prepared['zoneId'],
                               zoneSha256=prepared['zoneSha256'], sessionId=session_id)
            super().write_state()

    rclpy.init(args=['dual_map', '--ros-args', '-r', '__node:=dual_gps_vision',
                      '-r', '/fix:=/dual_gps/fix',
                      '-r', '/drive_test/odom:=/dual_gps/odom',
                      '-r', '/drive_test/yaw_ready:=/dual_gps/yaw_ready',
                      '-r', '/drive_test/semantic_observations:=/dual_gps/semantic_observations',
                      '-r', '/drive_test/obstacle_snapshot:=/dual_gps/obstacle_snapshot'])
    node = DualRecorder()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
