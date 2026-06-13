# Jetson 카메라와 웹 영상 연동

이 문서는 Intel RealSense D455를 Jetson에서 실행하는 방법과 ROS 2 영상 토픽을 웹 관제 화면까지 전달하기 위해 남은 작업을 구분한다.

## 1. 확인된 환경

- 장비: Intel RealSense D455 RGB-D 카메라
- Jetson: NVIDIA Jetson Orin Nano 16GB
- 운영체제: Ubuntu 22.04
- JetPack: 6.2 / L4T 36.5
- ROS 2: Humble
- Jetson 작업 공간: `/home/jangwoo/mower_ws`
- RealSense 라이브러리: `/usr/local/lib/librealsense2.so.2.57.6`
- 목표 영상 설정: 640x480, 15fps

HW 팀은 RSUSB 방식으로 RealSense 드라이버를 준비했다. 이 저장소에서 확인하는 범위는 카메라 장치 인식, ROS 2 노드 실행, 영상 토픽 발행과 향후 웹 스트리밍 연결이다.

## 2. 실행 전 장치 확인

카메라 노드를 실행하기 전에 D455가 USB 장치로 인식되는지 확인한다.

```bash
lsusb | grep -i -E "Intel|RealSense"
ls -l /dev/video*
rs-enumerate-devices -s
```

정상이라면 `lsusb`에서 Intel RealSense 장치가 표시되어야 한다. RSUSB 방식에서는 일반 UVC 방식과 달리 `/dev/video*`가 생성되지 않을 수 있으므로 이 항목만으로 실패를 확정하지 않는다. 다음 메시지가 나오고 카메라 노드도 실행 중이지 않다면 USB 연결과 전원을 먼저 점검한다.

```text
No device detected. Is it plugged in?
```

USB 3.0 케이블, 허브 전원, Jetson USB 포트와 D455 전원 상태를 확인한 뒤 `rs-enumerate-devices -s`가 장치를 찾는지 다시 확인한다. 카메라 노드가 장치를 사용 중이면 `RS2_USB_STATUS_BUSY`가 발생할 수 있으므로 이때는 `lsusb`, ROS 2 publisher와 실제 프레임 수신 결과를 우선한다.

## 3. 카메라 노드 실행

Jetson 터미널에서 ROS 2와 빌드 작업 공간을 불러온다.

```bash
source /opt/ros/humble/setup.bash
source ~/mower_ws/install/setup.bash
```

HW 팀이 제공한 실행 명령:

```bash
LD_PRELOAD=/usr/local/lib/librealsense2.so.2.57.6 \
ros2 launch realsense2_camera rs_launch.py \
  align_depth.enable:=true \
  pointcloud.enable:=false \
  enable_gyro:=false \
  enable_accel:=false \
  initial_reset:=true \
  depth_module.depth_profile:=640,480,15 \
  rgb_camera.color_profile:=640,480,15
```

현재 설치된 `realsense2_camera`의 launch 인자는 `depth_module.depth_profile`과 `rgb_camera.color_profile`이다. 기존에 전달받은 `depth_module.profile`, `rgb_camera.profile`은 적용되지 않는 이름이므로 사용하지 않는다.

저장소의 실행 스크립트는 올바른 프로파일과 별도 JPEG republisher를 함께 실행한다.

```bash
edge/jetson-camera/scripts/run-realsense-camera.sh
```

이 명령은 컬러와 깊이 영상을 640x480, 15fps로 요청하고 포인트 클라우드와 IMU 스트림은 비활성화한다. 쉘을 종료하면 카메라 노드와 JPEG republisher도 함께 종료된다.

## 4. ROS 2 검증 기준

프로세스가 실행됐다는 사실만으로 카메라가 정상이라고 판단하면 안 된다. 다음 세 단계를 모두 확인한다.

### 노드 확인

```bash
ros2 node list | grep /camera/camera
ros2 node info /camera/camera
```

### 토픽 확인

```bash
ros2 topic list | grep -E "camera|image|depth|color|compressed"
ros2 topic info /camera/camera/color/image_raw --verbose
ros2 topic info /camera/camera/color/image_raw/compressed --verbose
```

웹 영상 연동에서 우선 사용할 목표 토픽:

- 원본 컬러 영상: `/camera/camera/color/image_raw`
- 압축 컬러 영상: `/camera/camera/color/image_raw/compressed`

노드가 `/parameter_events`와 `/rosout`만 발행하고 영상 토픽이 없다면 카메라 장치 초기화가 실패한 상태다.

### 프레임 수신 확인

```bash
ros2 topic hz /camera/camera/color/image_raw
ros2 topic hz /camera/camera/color/image_raw/compressed
```

목표는 약 15Hz다. 토픽 이름만 존재하고 프레임이 들어오지 않는 경우도 있으므로 반드시 발행 주기와 메시지 크기를 함께 확인한다.

```bash
ros2 topic bw /camera/camera/color/image_raw
ros2 topic bw /camera/camera/color/image_raw/compressed
```

압축 토픽의 메시지가 수십 바이트 수준이면 header와 format만 있고 JPEG payload가 비어 있을 가능성이 높다.

저장소의 검증 스크립트는 USB 장치, 카메라 노드, 원본 해상도와 발행 주기, JPEG 형식과 payload 크기를 한 번에 확인한다.

```bash
edge/jetson-camera/scripts/verify-camera-output.sh
```

## 5. Foxglove 확인

Jetson의 Foxglove Bridge는 디버깅과 ROS 2 토픽 시각화에 사용한다.

```bash
ros2 launch foxglove_bridge foxglove_bridge_launch.xml address:=0.0.0.0
```

Tailscale에 연결된 PC에서 다음 주소를 사용한다.

```text
ws://100.92.7.56:8765
```

Foxglove에서 컬러 영상 토픽을 선택해 프레임을 확인한다. Foxglove 연결은 개발용 관측 경로이며 최종 웹 관제 시스템의 인증, 권한, 온디맨드 스트리밍 정책을 대신하지 않는다.

## 6. ROS 영상과 웹 영상의 차이

React 브라우저는 ROS 2 `sensor_msgs/Image` 또는 `sensor_msgs/CompressedImage`를 현재 프론트의 `<video>` 요소에서 직접 재생할 수 없다.

현재 목표 구조:

```text
RealSense D455
  -> ROS 2 color image topic
  -> Jetson 영상 송출 프로세스
  -> WebRTC media stream
  -> React VideoPanel
```

Foxglove WebSocket이나 rosbridge를 사용해 압축 이미지 메시지를 브라우저로 전달할 수는 있지만, 이것을 최종 영상 스트리밍 경로로 사용하면 대역폭, 지연, 브라우저 디코딩과 온디맨드 중단 정책을 별도로 해결해야 한다.

SRS의 최소 15fps, 480p, 최대 500kbps, WebRTC와 NVENC 요구사항을 만족하려면 Jetson에서 ROS 이미지 프레임을 H.264 계열로 인코딩하고 WebRTC로 전달하는 별도 구현이 필요하다.

## 7. 다음 개발 범위

카메라 하드웨어와 웹 영상 구현은 다음 순서로 진행한다.

1. 요청한 640x480 15fps 프로파일이 실제 원본 토픽에 적용되도록 실행 파라미터를 수정한다.
2. 압축 토픽에 실제 JPEG payload가 포함되도록 `compressed_image_transport` 설정을 점검한다.
3. Foxglove에서 실제 프레임을 확인한다.
4. Jetson 영상 송출 방식과 WebRTC 라이브러리를 결정한다.
5. 백엔드 `/api/video/{robotId}/offer|stop|reconnect` 계약을 구현한다.
6. 프론트 `VideoPanel`을 실제 `MediaStream`에 연결한다.
7. 스트림 중지 시 Jetson 인코딩과 전송이 실제로 중단되는지 확인한다.
8. 해상도, fps, bitrate와 재연결 실패 상태를 검증한다.

원본 영상 프로파일과 압축 영상 payload가 정상화되기 전에는 WebRTC 구현을 시작하지 않는다. 영상 소스가 불안정한 상태에서 시그널링과 브라우저 문제를 함께 디버깅하면 장애 원인을 분리하기 어렵다.

## 8. 2026년 6월 12일 확인 상태

| 항목 | 상태 |
|---|---|
| 카메라 실행 명령 확보 | 완료 |
| RealSense ROS 2 노드 실행 | 확인 |
| D455 USB 장치 인식 | 완료 |
| 컬러 원본 토픽 발행 | 완료 |
| 컬러 원본 프로파일 | 1280x720, 약 28fps로 목표와 불일치 |
| 압축 컬러 토픽 발행 | 약 30Hz |
| 압축 JPEG payload | 비어 있음 |
| Foxglove 영상 표시 | 미검증 |
| 웹 WebRTC 영상 송출 | 미구현 |

재확인 당시 `lsusb`에서 `Intel(R) RealSense(TM) Depth Camera 455`가 표시됐다. `/camera/camera/color/image_raw`에서 1280x720 RGB 프레임을 직접 수신했고 약 28fps, 약 85MB/s로 발행되는 것을 확인했다.

`/camera/camera/color/image_raw/compressed`는 약 30Hz로 발행되지만 평균 메시지 크기가 약 80바이트이고 `data`가 비어 있었다. 현재 남은 카메라 단계의 문제는 USB 연결이 아니라 실행 프로파일 미적용과 압축 JPEG 생성 실패다.

## 9. 2026년 6월 13일 정상화 결과

- 설치된 launch 인자명을 직접 확인해 `rgb_camera.color_profile:=640,480,15`와 `depth_module.depth_profile:=640,480,15`를 적용했다.
- 원본 컬러 영상이 640x480, 15.36Hz로 발행되는 것을 확인했다.
- RealSense 프로세스 내부 compressed publisher는 계속 빈 payload를 발행했다.
- 동일한 원본 토픽을 별도 `image_transport republish` 프로세스에서 압축했을 때 JPEG가 정상 생성됐다.
- 정상 압축 토픽은 `rgb8; jpeg compressed bgr8` 형식이며 확인 당시 payload는 109,104바이트였다.
- 실행 스크립트는 RealSense 내부 publisher를 raw 전용으로 제한하고 별도 republisher를 함께 시작·종료한다.
- systemd 자동 실행과 웹 WebRTC 영상 송출은 아직 구현하지 않았다.
