# Jetson RealSense 카메라

Intel RealSense D455의 ROS 2 컬러 영상을 640x480, 15fps로 실행하고 검증하는 수동 스크립트다.

## 실행

Jetson에서 저장소 루트를 기준으로 실행한다.

```bash
chmod +x edge/jetson-camera/scripts/*.sh
edge/jetson-camera/scripts/run-realsense-camera.sh
```

스크립트는 foreground로 실행된다. 종료하려면 `Ctrl+C`를 누른다.

현재 Jetson의 RealSense 프로세스 내부 `compressed_image_transport` publisher는 빈 JPEG payload를 발행한다. 실행 스크립트는 RealSense publisher를 raw 전용으로 제한하고 별도 `image_transport republish` 프로세스로 정상 JPEG를 같은 압축 토픽에 발행한다.

## 검증

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

systemd 자동 실행과 WebRTC 영상 송출은 별도 단계에서 구현한다.
