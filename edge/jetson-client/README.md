# Jetson Edge Client

Jetson Orin Nano에서 Spring Boot 백엔드의 MQTT command topic을 구독하고 ROS 2 topic으로 전달하는 Phase 1 Edge Client입니다.

현재 Phase 1은 MQTT command 검증, ROS 2 제어 출력, command ACK, telemetry/status 발행, 로컬 데드맨 스위치와 E-Stop 상태 처리를 제공한다. STM32 USB CDC serial 처리는 이 패키지에서 하지 않습니다. `/cmd_vel`을 구독하는 별도 Jetson bridge node가 STM32 NUCLEO-F439ZI(`/dev/ttyACM0`, 115200bps)로 전달한다고 가정합니다.

## 대상 환경

- NVIDIA Jetson Orin Nano 16GB
- JetPack 6.2 / L4T 36.5
- Ubuntu 22.04
- ROS 2 Humble
- Python 3.10

## MQTT 계약

`docs/mqtt-topic-contract.md`를 기준으로 구현합니다.

구독:

- `mowers/{robotId}/commands/manual`
- `mowers/{robotId}/commands/stop`
- `mowers/{robotId}/commands/estop`
- `mowers/{robotId}/commands/mode`
- `mowers/{robotId}/commands/attachment`

발행:

- `mowers/{robotId}/commands/ack`
- `mowers/{robotId}/telemetry`
- `mowers/{robotId}/status`

참고: 현재 MQTT 계약의 manual direction은 `backward`이고, 기존 프론트엔드 타입에는 `reverse`가 남아 있습니다. Phase 1 client는 계약값 `backward`와 호환값 `reverse`를 모두 `/cmd_vel` 후진으로 처리합니다.

## 설치

Jetson에서 ROS 2 Humble 환경을 먼저 source합니다.

```bash
source /opt/ros/humble/setup.bash
```

의존성을 설치합니다.

```bash
cd edge/jetson-client
python3 -m pip install -r requirements.txt
```

ROS 2 workspace에 넣어 빌드하는 경우:

```bash
mkdir -p ~/mower_ws/src
cp -r edge/jetson-client ~/mower_ws/src/jetson_mower_client
cd ~/mower_ws
rosdep install --from-paths src -y --ignore-src
colcon build --packages-select jetson_mower_client
source install/setup.bash
```

## 설정

텔레메트리는 센서별로 값 또는 `null`을 보낸다. 유효한 GPS fix가 최근 3초 안에 도착하면 위치를 보내며, GPS 미수신·fix 실패·유효 범위 밖의 위치는 두 좌표 모두 `null`이다. 배터리·속도·신호는 실제 입력원이 아직 없어 `null`이며, 설정 기본값을 실측값처럼 발행하지 않는다. 초기 모드·작업은 미수신으로 시작한다. 명령으로 갱신되는 로컬 소프트웨어 상태와 STM32의 물리 실행 결과는 구분해야 한다.

`main.py`는 기존 제어 publisher를 포함하는 프로그램이다. 텔레메트리 계약 변경만 확인하려고 실제 장비에서 전체 클라이언트를 실행하지 않는다. PC 검사는 `python -m unittest discover -s tests -v`를 사용하며 실제 센서·MQTT·ROS·구동 검증과 구분한다.

예시 설정 파일을 복사해서 로컬 값으로 수정합니다.

```bash
cp config.yaml.example config.yaml
```

주요 값:

- `robot_id`: MQTT topic의 `{robotId}`와 payload `robotId`
- `mqtt.broker_url`: MQTT broker URL
- `mqtt.ca_cert_path`: `mqtts://`에서 사용할 신뢰 CA PEM 파일 경로. 절대 경로를 권장하며, 상대 경로는 실행 디렉터리를 기준으로 한다. 비워 두면 시스템 기본 CA를 사용한다. CA 경로와 `mqtt://`를 함께 지정하면 시작을 거부한다. TLS는 1.2 이상으로 제한하고 서버 인증서와 호스트명을 검증한다.
- `ros.cmd_vel_topic`: 주행 명령 publish topic. 기본값은 `/cmd_vel`
- `ros.cmd_vel_qos_depth`: `/cmd_vel` publisher의 `keep_last` depth. 기본값은 `10`
- `ros.cmd_vel_qos_durability`: `/cmd_vel` publisher durability. 기본값은 `volatile`
- `ros.cmd_vel_qos_reliability`: `/cmd_vel` publisher reliability. 기본값은 `reliable`
- `ros.fix_topic`: GPS 구독 topic. 기본값은 `/fix`
- `ros.imu_topic`: IMU 구독 topic. 기본값은 `/camera/imu`

## 실행

### 상태 전송 전용 실행과 전원 ON 자동 시작

웹 연결만 확인할 때는 `jetson_mower_client.monitor`를 사용한다. 이 프로그램은 `/fix`만 구독하고 MQTT의 자기 로봇 `telemetry`·`status`만 발행한다. MQTT 명령 구독·처리와 ROS 주행·모드·엔진 출력, 시리얼 장치 접근은 하지 않는다. ROS 자체의 `/parameter_events` publisher는 존재할 수 있지만 제어 출력은 아니다. `온라인`은 상태 전송 프로그램의 연결을 의미하며 센서·STM32·예초 작업 정상 여부를 보증하지 않는다.

실제 TLS 계정·CA가 준비된 `config.yaml`을 유지하고 상태 전용 실행기를 사용한다. 이 실행기는 현재 터미널의 위치와 관계없이 자신의 소스 경로와 설정을 사용하므로 다른 ROS 작업공간 설치본을 잘못 실행하지 않는다.

```bash
bash "$HOME/autonomous-mower/edge/jetson-client/scripts/run-telemetry-monitor.sh"
```

전원 ON 자동 실행은 사용자 systemd 서비스로 등록한다. 아래 unit은 저장소가 `$HOME/autonomous-mower`에 있는 경우를 기준으로 한다. 다른 위치라면 unit의 두 경로를 실제 위치에 맞춘다. 기존 서비스가 있으면 먼저 내용을 확인하고 덮어쓰지 않는다.

```bash
mkdir -p "$HOME/.config/systemd/user"
cp "$HOME/autonomous-mower/edge/jetson-client/systemd/mower-telemetry.service" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
loginctl enable-linger "$USER"
systemctl --user enable --now mower-telemetry.service
```

`enable-linger`는 로그인 전에도 사용자 서비스를 시작하고 SSH 연결 종료 후 유지하도록 한다. 서비스는 PC·Tailscale이 늦게 준비되거나 프로그램이 종료되면 10초 간격으로 재시도한다. 네트워크가 끊긴 동안 새 측정 메시지를 계속 쌓지 않으며 GPS가 3초 이상 갱신되지 않으면 위치를 null로 보낸다. 실제 재부팅·전원 ON 검증은 서비스 등록·현재 실행 확인과 구분한다.

```bash
systemctl --user status mower-telemetry.service --no-pager
systemctl --user restart mower-telemetry.service
# 이번 실행만 중지: 다음 부팅의 자동 실행 등록은 유지한다.
systemctl --user stop mower-telemetry.service
# 자동 실행도 해제하고 현재 실행을 중지한다.
systemctl --user disable --now mower-telemetry.service
```

PC의 `stop.ps1`은 이 Jetson 서비스를 종료하지 않는다. PC가 꺼져 있으면 상태 전송 연결은 재시도하고 웹 백엔드도 응답하지 않는다. 상태 모니터와 기존 제어 클라이언트는 같은 MQTT client ID를 사용하므로 동시에 실행하지 않는다. 제어 통합 시험으로 전환할 때는 먼저 모니터의 자동 실행을 해제하고 장비 계정 권한·안전 조건을 별도로 확인한다.

### 기존 제어 클라이언트 실행

colcon으로 빌드한 경우:

```bash
ros2 run jetson_mower_client jetson_mower_client --config edge/jetson-client/config.yaml
```

개발 중에는 Python module로 바로 실행할 수도 있습니다.

```bash
cd edge/jetson-client
python3 -m jetson_mower_client.main --config config.yaml
```

`__main__.py`가 포함되어 있으므로 다음처럼 더 짧게 실행할 수 있다.

```bash
cd edge/jetson-client
python3 -m jetson_mower_client --config config.yaml
```

Jetson에서 반복 실행할 때는 제공된 스크립트를 사용한다. 이 스크립트는 ROS 2 Humble 환경을 source하고 현재 디렉터리를 `PYTHONPATH`에 추가한다.

```bash
cd edge/jetson-client
chmod +x scripts/run-jetson-client.sh
./scripts/run-jetson-client.sh --config config.yaml
```

## 현재 동작

- manual command를 `geometry_msgs/Twist`로 변환해 `/cmd_vel`로 publish
- stop command 수신 시 zero `Twist` publish
- 긴급 정지(E-Stop) 수신 시 즉시 zero `Twist` publish 후 emergency state 진입
- command ack를 `mowers/{robotId}/commands/ack`로 publish
- `/fix`와 `/camera/imu`를 구독하고 telemetry payload에 넣을 수 있도록 최신 sample을 보관
- telemetry/status MQTT publish skeleton 제공

## 아직 구현하지 않은 것

- STM32 serial write. 별도 Jetson bridge node 책임입니다.
- mower attachment 실제 제어. Phase 1에서는 ack와 status skeleton만 둡니다.
- WebRTC camera 송출. `/camera/camera/color/image_raw`와 compressed topic 연동은 이후 phase에서 처리합니다.
- GPS/IMU 값을 이용한 완전한 telemetry 계산. 현재는 구독 skeleton과 payload 자리만 제공합니다.

## 로컬 검증

ROS 2가 없는 개발 PC에서도 순수 Python 모듈 syntax와 command mapping 테스트는 실행할 수 있습니다.

```bash
cd edge/jetson-client
python -m compileall jetson_mower_client tests
python -m unittest discover -s tests
```

## Stop과 E-Stop 하드웨어 출력 차이

Stop과 E-Stop은 의도적으로 다르게 처리한다.

Stop은 일반 정지 명령이다. 다음 topic에 속도 0만 publish한다.

- `/cmd_vel`
  - type: `geometry_msgs/Twist`
  - 값: 속도 0

E-Stop은 Jetson/STM32 하드웨어 브릿지 상태 머신을 위한 안전 비상정지 명령이다. publish 순서는 다음과 같다.

1. `/cmd_vel`
   - type: `geometry_msgs/Twist`
   - 값: 속도 0
2. `/mower/set_mode`
   - type: `std_msgs/Int8`
   - 값: `2`
   - 의미: EMERGENCY mode
3. `/mower/engine`
   - type: `std_msgs/Bool`
   - 값: `false`
   - 의미: 가솔린 엔진 릴레이 강제 차단

E-Stop 이후 client는 로컬 emergency state를 유지하고 일반 명령을 거부한다. 향후 reset-after-emergency 흐름이 추가되더라도 엔진을 자동으로 다시 켜거나 이전 주행/작업 장치 출력을 자동 복구하면 안 된다.

## `/cmd_vel` QoS 설정

`/cmd_vel` publisher는 일반적인 ROS 2 제어 topic과 `ros2 topic echo`에 맞춰 다음 QoS를 기본으로 사용한다.

- history: `keep_last`
- depth: `10`
- durability: `volatile`
- reliability: `reliable`

설정 파일에서 다음 값을 변경할 수 있다.

```yaml
ros:
  cmd_vel_qos_depth: 10
  cmd_vel_qos_durability: volatile
  cmd_vel_qos_reliability: reliable
```

지원 값:

- `cmd_vel_qos_durability`: `volatile`, `transient_local`
- `cmd_vel_qos_reliability`: `reliable`, `best_effort`

다음 경고가 발생하면 publisher와 subscriber의 durability가 서로 맞지 않는 상태이다.

```text
New subscription discovered on topic '/cmd_vel', requesting incompatible QoS.
Last incompatible policy: DURABILITY
```

먼저 Jetson에서 subscriber QoS를 확인한다.

```bash
ros2 topic info /cmd_vel --verbose
```

하드웨어 브릿지 subscriber가 `transient_local`을 요청한다면 일반적인 제어 topic 동작에 맞게 브릿지 subscriber를 `volatile`로 변경하는 것을 우선 권장한다. 브릿지를 즉시 변경할 수 없는 경우에만 `cmd_vel_qos_durability: transient_local`로 publisher 설정을 맞춘다.

`ros2 topic echo`로 확인할 때는 다음처럼 QoS를 명시할 수 있다.

```bash
ros2 topic echo /cmd_vel geometry_msgs/msg/Twist \
  --qos-durability volatile \
  --qos-reliability reliable
```
