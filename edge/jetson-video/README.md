# Jetson MediaMTX 영상 송출

ROS 2 컬러 영상을 NVIDIA H.264 하드웨어 인코더로 압축해 MediaMTX에 RTSP로 발행한다. 브라우저는 MediaMTX WHEP 엔드포인트에서 WebRTC 영상을 수신한다.

## 필수 패키지

```bash
sudo apt install -y gstreamer1.0-plugins-bad gstreamer1.0-rtsp
```

MediaMTX Linux ARM64 바이너리는 공식 릴리스에서 내려받아 `edge/jetson-video/bin/mediamtx`에 둔다. 바이너리는 저장소에 커밋하지 않는다.

## 준비

```bash
cp edge/jetson-video/config.yaml.example edge/jetson-video/config.yaml
cp edge/jetson-video/mediamtx.yml.example edge/jetson-video/mediamtx.yml
chmod +x edge/jetson-video/scripts/*.sh
```

## 시연용 통합 실행

다음 명령 하나로 카메라, MediaMTX와 NVENC 영상 송출기를 순서대로 시작한다.

```bash
edge/jetson-video/scripts/run-video-demo.sh
```

스크립트는 컬러 원본 토픽과 MediaMTX API가 준비된 것을 확인한 뒤 다음 단계를 시작한다. 구성요소 하나가 종료되거나 `Ctrl+C`를 누르면 함께 시작한 프로세스를 모두 종료한다.

`MOWER-01`의 WHEP 주소:

```text
http://100.92.7.56:8889/mowers/MOWER-01/whep
```

위 통합 실행은 수동 실행용이며 인코더도 계속 실행한다. 아래 자동 실행 구성과 동시에 실행하지 않는다.

## 개별 실행

장애 지점을 분리해서 확인할 때는 각 명령을 별도 터미널에서 실행한다.

```bash
edge/jetson-camera/scripts/run-realsense-camera.sh
edge/jetson-video/scripts/run-mediamtx.sh
edge/jetson-video/scripts/run-video-streamer.sh
```

## Tailscale HTTPS와 전원 ON 자동 실행

2026-10-22 적용한 구성은 카메라 원본과 MediaMTX를 사용자 systemd 서비스로 상시 대기시키고, 시청 요청이 있을 때만 NVENC 인코더·RTSP publisher를 실행한다. 마지막 시청자가 종료하면 `runOnDemandCloseAfter: 0s`에 따라 송출 프로세스도 종료한다. 카메라의 ROS 원본 발행은 계속되므로 영상 중지는 USB 카메라 전원 끄기를 뜻하지 않는다.

현재 영상 전용 카메라 실행기는 `enable_gyro:=false`, `enable_accel:=false`로 IMU를 끈다. 팀 인계 자료의 주행 구성은 같은 D455의 IMU를 사용하므로 이 구성을 주행 통합용으로 취급하지 않는다. 주행·비전 launch와 카메라 서비스를 동시에 기동하기 전에, D455를 여는 노드를 하나로 정하고 IMU·컬러·필요한 깊이 토픽을 함께 발행하도록 통합해야 한다. 이번 검증은 카메라 단독 시연이며 주행과의 공존 검증은 수행하지 않았다.

현재 장비의 MediaMTX는 v1.9.0이다. `mediamtx-tailnet.v1.9.yml.example`은 해당 버전의 `protocols`, `webrtcAllowOrigin` 키를 사용한다. 다른 버전 설정을 그대로 섞지 않는다. 실제 설정은 Git 밖의 `~/.local/share/autonomous-mower/video-demo/`에 두며 디렉터리는 700, 파일은 600으로 제한한다.

| 경로 | 역할 |
|---|---|
| `~/autonomous-mower/edge/jetson-camera/` | 카메라 원본 실행 코드 |
| `~/autonomous-mower/edge/jetson-video/` | 온디맨드 송출 코드와 서비스 예제 |
| `~/.local/share/autonomous-mower/video-demo/stream.yaml` | 로봇 ID·ROS 원본 토픽·640×480·15fps·인코더 목표 500kbps |
| `~/.local/share/autonomous-mower/video-demo/mediamtx.yml` | 내부 HTTPS 뒤의 WHEP·시청자 권한·온디맨드 설정 |
| `~/.config/systemd/user/mower-camera.service` | 카메라 자동 시작과 장애 재시작 |
| `~/.config/systemd/user/mower-video.service` | MediaMTX 자동 시작과 장애 재시작 |

서비스 예제의 바이너리 위치는 기존 ROS 작업공간의 `~/mower_ws/src/autonomous-mower/edge/jetson-video/bin/mediamtx`를 사용한다. 실행 코드와 별도 저장소이므로 해당 작업공간을 일괄 pull하거나 덮어쓰지 않는다. 다른 PC·장비에서는 실제 설치 위치에 맞춰 unit을 먼저 확인해야 한다.

RTSP 8554·WHEP HTTP 8889·관리 API 9997은 loopback으로 제한한다. Tailscale Serve는 HTTPS 8443에서 8889로 전달하며 영상용 Funnel은 열지 않는다. 미디어 UDP/TCP 8189도 Jetson의 Tailscale IP에만 바인딩한다. 시청자 PC의 Tailscale IP 하나에는 자기 로봇 경로의 읽기만 허용하고, localhost에만 발행·관리 권한을 부여한다. CORS Origin은 프론트의 정확한 HTTPS 주소를 사용한다.

이미 적용된 장비에서 확인·수동 종료·복구하는 명령은 다음과 같다.

```bash
systemctl --user status mower-camera.service mower-video.service
journalctl --user -u mower-video.service -n 30 --no-pager
# 영상 서비스와 카메라 원본을 모두 중지한다. 상태 전송 서비스는 유지한다.
systemctl --user stop mower-video.service mower-camera.service
systemctl --user start mower-camera.service mower-video.service
```

`stop`은 현재 실행만 중지하므로 다음 전원 ON에서는 다시 시작한다. 자동 시작도 해제하려면 `systemctl --user disable --now mower-video.service mower-camera.service`를 사용한다. 적용 장비에는 두 서비스의 enable과 사용자 Linger를 설정했다. 실제 전원 재인가 후 복구는 별도 확인 대상이다.

처음 적용하는 장비에서는 template의 `<JETSON_HOME>`, `<ROBOT_ID>`, `<JETSON_TAILSCALE_IP>`, `<VIEWER_TAILSCALE_IP>`, `<FRONTEND_HOST>`를 실제 값으로 바꾸고 stream.yaml을 준비한 뒤 unit을 등록한다. Tailscale HTTPS 경로는 관리자 권한으로 다음과 같이 설정한다.

```bash
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8889
```

PC 백엔드의 `VIDEO_WHEP_BASE_URL`은 `https://<JETSON_TAILSCALE_HOST>:8443`으로 설정하고 백엔드를 재시작한다. 브라우저는 백엔드가 발급한 `/mowers/<ROBOT_ID>/whep` 주소로 직접 연결한다. 현재 경로에서는 시청 기기도 Tailscale에 연결되어야 하며, 다른 기기를 추가하려면 읽기 허용 IP도 함께 검토한다. Vercel 배포 주소만 안다고 영상을 볼 수 있는 구성은 아니다.

640×480 원본 약 15fps와 실제 브라우저 재생은 별도로 확인한다. 500kbps는 인코더 목표값이며 네트워크 오버헤드를 포함한 순간 최대 전송률 보장이나 자동 품질 조정이 검증된 것은 아니다. TURN·비 Tailscale 기기의 시청·자동 스냅샷은 이 구성에 포함하지 않는다.
