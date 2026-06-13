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

## 실행 순서

각 명령은 별도 터미널에서 실행한다.

```bash
edge/jetson-camera/scripts/run-realsense-camera.sh
edge/jetson-video/scripts/run-mediamtx.sh
edge/jetson-video/scripts/run-video-streamer.sh
```

`MOWER-01`의 WHEP 주소:

```text
http://100.92.7.56:8889/mowers/MOWER-01/whep
```

현재 구성은 Tailscale 내부 수동 실행용이다. systemd 자동 시작, TLS, TURN과 외부 인터넷 공개는 후속 범위다.
