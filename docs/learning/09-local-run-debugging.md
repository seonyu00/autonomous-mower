# 로컬 실행과 디버깅

이 문서는 공개용 예제이므로 실제 자격 증명은 환경변수 또는 Git에서 제외된 `.env`에 설정한다.

## 1. 인프라 실행

```powershell
docker compose up -d postgres mosquitto
docker compose ps
```

## 2. 백엔드 실행

```powershell
cd backend

$env:SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/mower"
$env:SPRING_DATASOURCE_USERNAME="<DB_USERNAME>"
$env:SPRING_DATASOURCE_PASSWORD="<DB_PASSWORD>"
$env:JWT_SECRET="<JWT_SECRET>"
$env:MQTT_ENABLED="true"
$env:MQTT_BROKER_URL="tcp://localhost:1883"

.\gradlew.bat bootRun
```

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

## 3. Edge Mock 실행

```powershell
cd tools\edge-mock-client
npm install

$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="<ROBOT_ID>"
npm start
```

## 4. 프론트엔드 실행

```powershell
cd frontend
npm install

$env:VITE_API_PROXY_TARGET="http://localhost:8080"
$env:VITE_ENABLE_MOCK_AUTH="false"
$env:VITE_ENABLE_MOCK_CONTROL="false"
$env:VITE_ENABLE_MOCK_ROBOTS="false"
$env:VITE_ENABLE_MOCK_REALTIME="false"
$env:VITE_WSS_URL="ws://localhost:8080/ws"

npm run dev
```

### 방향 버튼 활성화 조건

방향 버튼은 로그인만으로 활성화되지 않는다. 지도 화면의 제어 패널에서 다음 조건을 모두 만족해야 한다.

1. `MOWER-01`을 선택한다.
2. `제어권 요청`을 눌러 제어권(Control Lock) 상태가 `held`인지 확인한다.
3. 제어권 소유자가 현재 로그인 사용자와 일치하는지 확인한다.
4. 긴급 정지(E-Stop) 상태가 아닌지 확인한다.
5. 제어 패널의 실시간 상태가 `mock` 또는 `connected`인지 확인한다.
6. HTTPS와 WSS 상태가 제어 가능한 상태인지 확인한다.

로컬 통합 시험에서는 REST, 백엔드, MQTT를 실제로 사용하면서 프론트의 미완성 STOMP 연결만 Mock 상태로 둘 수 있다.

```powershell
$env:VITE_ENABLE_MOCK_AUTH="false"
$env:VITE_ENABLE_MOCK_CONTROL="false"
$env:VITE_ENABLE_MOCK_ROBOTS="false"
$env:VITE_ENABLE_MOCK_REALTIME="true"
```

`VITE_ENABLE_MOCK_REALTIME=true`는 영상과 실시간 상태의 완전한 E2E 검증을 의미하지 않는다. 방향 명령은 `VITE_ENABLE_MOCK_CONTROL=false`일 때 실제 REST와 MQTT 경로로 전송된다.

Vite 개발 서버가 중복 실행되면 이전 환경변수를 가진 프로세스가 `5173`을 점유하고 새 프로세스가 `5174`로 실행될 수 있다. 이 경우 브라우저가 이전 설정을 계속 사용해 방향 버튼이 잠길 수 있다.

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -ge 5173 -and $_.LocalPort -le 5180 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

중복 프로세스를 종료한 뒤 프론트엔드를 하나만 실행하고 브라우저에서 `Ctrl+F5`로 새로고침한다.

## 5. Tailscale을 통한 Jetson 연결

2026년 6월 12일 확인한 개발 장비 정보:

- Jetson 호스트명: `jetson-mower`
- SSH 사용자: `jangwoo`
- Jetson Tailscale IP: `100.92.7.56`
- Jetson 저장소: `/home/jangwoo/autonomous-mower`
- 개발 PC에서 확인한 Tailscale IP: `100.124.51.102`

Tailscale IP와 연결 상태는 실행할 때 다시 확인한다.

```powershell
tailscale status
tailscale ip -4
Test-NetConnection 100.92.7.56 -Port 22
```

SSH 접속:

```powershell
ssh jangwoo@100.92.7.56
```

비밀번호는 문서, Git, 명령 기록에 저장하지 않는다. 가능하면 Jetson에 SSH 공개 키를 등록하고 비밀번호 인증을 비활성화한다.

### Jetson MQTT 설정

로컬 Mosquitto는 개발 PC에서 실행되므로 Jetson의 `edge/jetson-client/config.yaml`에서 `localhost`를 사용하면 안 된다. `localhost`는 Jetson 자신을 가리킨다.

Jetson에서 다음 파일을 연다.

```bash
cd /home/jangwoo/autonomous-mower/edge/jetson-client
nano config.yaml
```

`broker_url`에는 실행 시점에 `tailscale ip -4`로 확인한 개발 PC 주소를 설정한다.

```yaml
mqtt:
  broker_url: mqtt://100.124.51.102:1883
```

개발 PC에서 Mosquitto와 방화벽 상태를 확인한다.

```powershell
docker compose up -d mosquitto
Test-NetConnection localhost -Port 1883
Get-NetFirewallRule -Direction Inbound -Enabled True |
  Where-Object { $_.DisplayName -match "MQTT|Mosquitto|1883" }
```

Jetson에서 MQTT 포트 연결을 확인한다.

```bash
nc -vz 100.124.51.102 1883
```

### Jetson Edge Client 실행

실제 Jetson을 연결할 때는 동일한 `MOWER-01`을 사용하는 Edge Mock을 먼저 종료한다. 둘을 동시에 실행하면 텔레메트리, 상태와 ACK의 출처가 섞여 실제 장비 검증 결과를 신뢰할 수 없다.

```bash
cd /home/jangwoo/autonomous-mower/edge/jetson-client
./scripts/run-jetson-client.sh --config config.yaml
```

별도 Jetson 터미널에서 다음 항목을 확인한다.

```bash
source /opt/ros/humble/setup.bash
ros2 node list
ros2 topic info /cmd_vel --verbose
ros2 topic echo /cmd_vel geometry_msgs/msg/Twist \
  --qos-durability volatile \
  --qos-reliability reliable
```

실제 방향 명령을 보내기 전에는 바퀴를 지면에서 띄우고 예초 장치와 엔진 출력을 물리적으로 차단한다. 현재 ACK는 Jetson의 명령 수신과 ROS 2 publish 시도를 나타내며 STM32 또는 모터 출력 완료를 보장하지 않는다.

## 6. 카메라 영상 확인 범위

현재 프론트에는 WebRTC 영상 패널과 Mock 시그널링 골격이 있지만 다음 항목은 구현되지 않았다.

- 백엔드 `/api/video/{robotId}/offer|stop|reconnect`
- Jetson 카메라 WebRTC/NVENC 송출
- 실제 원격 `MediaStream`
- 스냅샷 업로드와 저장

HW 팀이 카메라를 다시 연결한 뒤 2026년 6월 12일 재확인했을 때 D455 USB 장치와 컬러 영상 토픽이 정상적으로 나타났다. 원본 컬러 영상은 실제 프레임이 들어오지만 1280x720 약 28fps로 동작해 요청한 640x480 15fps 설정과 일치하지 않는다. 압축 토픽은 약 30Hz로 발행되지만 메시지 크기가 약 80바이트뿐이라 JPEG 영상 데이터가 비어 있는 상태다. 따라서 현재 화면의 영상 영역과 스트림 버튼은 아직 실제 카메라 송출 검증으로 판단하면 안 된다.

카메라 실행 명령, USB 사전 점검, ROS 2 토픽 검증과 향후 WebRTC 연결 범위는 [Jetson 카메라와 웹 영상 연동](11-jetson-camera-video-flow.md)을 따른다.

## 디버깅 순서

1. `docker compose ps`로 PostgreSQL과 Mosquitto 상태를 확인한다.
2. 백엔드 health endpoint를 확인한다.
3. Edge Mock에서 telemetry 발행 로그를 확인한다.
4. 백엔드에서 MQTT 수신과 DB 저장 로그를 확인한다.
5. 브라우저 개발자 도구에서 REST와 WebSocket 연결을 확인한다.
6. `command_execution` 테이블에서 명령 상태를 확인한다.

로그나 화면을 공유할 때 JWT, Authorization 헤더, 실제 계정, 외부 주소를 제거한다.
