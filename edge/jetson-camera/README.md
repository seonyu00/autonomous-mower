# Jetson RealSense 카메라

Intel RealSense D455의 ROS 2 컬러 영상을 640x480, 15fps로 실행하고 IMU도 함께 발행하는 스크립트다. 수동 실행과 영상 대기용 사용자 서비스에서 같은 실행기를 사용한다.

## 실행

Jetson에서 저장소 루트를 기준으로 실행한다.

```bash
chmod +x edge/jetson-camera/scripts/*.sh
edge/jetson-camera/scripts/run-realsense-camera.sh
```

스크립트는 foreground로 실행된다. 종료하려면 `Ctrl+C`를 누른다.

현재 Jetson의 RealSense 프로세스 내부 `compressed_image_transport` publisher는 빈 JPEG payload를 발행한다. 실행 스크립트는 RealSense publisher를 raw 전용으로 제한하고 별도 `image_transport republish` 프로세스로 정상 JPEG를 같은 압축 토픽에 발행한다.

## IMU 활성화

`enable_gyro:=true`, `enable_accel:=true`, `unite_imu_method:=2`로 자이로와 가속도를 켜고 가속도를 자이로 시각에 보간해 `/camera/camera/imu`를 발행한다. 메시지는 `sensor_msgs/msg/Imu`이며 BEST_EFFORT로 구독한다. 설치 장비의 설정은 자이로 200Hz·가속도 100Hz이며 통합 IMU도 실제 약 200Hz로 수신했다. 측정 환경과 영상 동시 수신 근거는 [개발 로그](../../docs/development-log.md)의 2026-10-22 기록을 따른다.

IMU는 Jetson의 ROS 토픽으로 제공하며 웹 송출기는 컬러 영상만 압축·전송한다. 웹에서 스트림을 중지해도 카메라 서비스가 실행 중이면 IMU 발행은 유지된다. 이 설정은 위치·방향 추정이나 주행 프로그램을 자동 실행하지 않는다. 현재는 주행과 분리한 영상·센서 구성으로 유지하며, 같은 D455를 여는 팀원 launch와의 중복 기동은 별도 합의가 필요하다.

## 검증

### 2026-11-17 깊이 공간 필터의 임시 실행

장애물 관측 시험 중 공간·시간·깊이 채우기·간소화·시차 필터가 모두 꺼져 있음을 확인했다. 실제 추종기가 실행되지 않은 상태에서 아래 공간 필터만 활성화했다. `holes_fill`은 기존과 같이 0이며 시간 필터와 별도 깊이 채우기 필터는 꺼진 상태를 유지했다. 공간 필터의 기존 값은 magnitude=2, smooth_alpha=0.5, smooth_delta=20으로 변경하지 않았다.

```bash
source /opt/ros/humble/setup.bash
ros2 param set /camera/camera spatial_filter.holes_fill 0
ros2 param set /camera/camera spatial_filter.enable true
ros2 param get /camera/camera spatial_filter.enable
```

이번 변경은 실행 중인 카메라의 임시 파라미터이며 서비스·시작 스크립트에는 저장하지 않았다. 카메라 재시작 후에는 다시 확인한다. 복구는 `ros2 param set /camera/camera spatial_filter.enable false`다. 공유 깊이 입력을 쓰는 두 관측기에 함께 영향을 주며, 별도 카메라나 관측기를 새로 시작하지 않았다.

적용 후 새 관측 12개에서 근접 정지 요청 4개·미감지 8개를 확인했다. 통제된 전후 비교가 아니므로 오탐 감소·정확도 개선으로 해석하지 않는다. 모든 관측에 위치·방향 동기화 실패가 남아 지리 좌표 지도와 CPP 경로 생성 성공은 확인하지 못했다. 근접 정지 기준·재개 잠금과 센서 만료 조건은 변경하지 않았다.

카메라 노드를 실행한 다른 터미널에서 다음 명령을 실행한다.

```bash
edge/jetson-camera/scripts/verify-camera-output.sh
```

검증 항목:

- Intel RealSense D455 USB 인식
- `/camera/camera` 노드 실행
- 원본 컬러 영상 640x480
- 원본 컬러 영상 12~18Hz
- 압축 컬러 영상 JPEG 형식
- 압축 JPEG payload가 비어 있지 않음

## 환경 경로 변경

기본 경로와 다른 환경에서는 실행 전에 환경변수를 설정한다.

```bash
export ROS_SETUP=/opt/ros/humble/setup.bash
export MOWER_SETUP="$HOME/mower_ws/install/setup.bash"
export REALSENSE_LIBRARY=/usr/local/lib/librealsense2.so.2.57.6
```

systemd 자동 실행과 WebRTC 영상 송출·중지는 [영상 실행 안내](../jetson-video/README.md#tailscale-https와-전원-on-자동-실행)를 따른다. 실행기를 수정하면 카메라 서비스를 재시작해야 반영된다. 실제 IMU 발행과 웹 영상 재생을 확인한 뒤 적용 완료로 판단한다.
