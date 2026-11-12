# Jetson Edge Client

Jetson Orin Nano에서 Spring Boot 백엔드의 MQTT command topic을 구독하고 ROS 2 topic으로 전달하는 Phase 1 Edge Client입니다.

현재 클라이언트는 MQTT command 검증, ROS 2 제어 출력, command ACK, telemetry/status 발행, 로컬 데드맨 스위치와 E-Stop 상태 처리를 제공한다. 기본 ROS 방식은 `/cmd_vel`을 구독하는 별도 bridge node를 사용한다. `manual_serial.port`를 설정하면 이 패키지의 STM32 USB CDC 시리얼 어댑터를 사용하며, 웹 준비 요청으로 포트를 여는 방식은 아래 관제 대기를 따른다.

## 웹 버튼에서 수동 제어 준비

예전 시험 서비스를 매번 수동 실행하는 대신, `mower-control-gateway.service` 하나가 상태 전송과 MQTT 명령 수신을 담당하도록 구성했다. 프로세스 시작만으로 시리얼 포트를 열지 않는다. 웹의 `수동 조작 재개`가 인증·제어권·일회용 확인값 검사를 거친 `manual-prepare`를 보낸 뒤에만 제어 포트를 연다. 기존 `monitor.py`와 `mower-telemetry.service`는 상태 전용 방식으로 그대로 남긴다.

1. 재개 클릭 후 최대 30초 동안 준비한다. 포트를 연 이후 현장 리모컨 개입과 해제를 새로 확인해야 한다. 담당자가 리모컨을 잠깐 조작했다 놓고 유지 시간 약 5초가 지난 중립 진단을 기다린다. **리모컨 조작은 실제 이동을 일으킬 수 있으므로 격리 시험에서 함께 확인한다.**
2. 준비 완료는 이동 명령이 아니다. 웹이 새 확인값으로 재개 요청을 하고 장비 수신 확인 후 방향 버튼을 켠다. 준비 완료 후 재개까지의 장비 대기 한도는 2초다.
3. 별도로 방향 버튼을 누르고 있는 동안만 이동한다. 기존 ±100 출력 한도·350ms 입력 수명·리모컨 우선을 유지한다. 일반 정지·취소·단절·준비 만료 또는 리모컨 개입으로 재개가 풀리면 포트를 닫는다. 포인터 해제는 기존 누름 식별자의 정지를 보내며 서버 데드맨 정지도 유지한다.

장비의 비공개 `config.yaml`에 다음을 설정한다. 포트는 실제 연결을 확인해 지정한다. 기본 `on_demand: false`는 기존 실행 방식과 호환되며 새 실행기는 `true`가 아니면 종료한다.

```yaml
manual_serial:
  port: /dev/ttyACM0
  on_demand: true
```

전제는 pyserial과 `fuser`(Ubuntu `psmisc`) 설치, 포트 접근 권한이다. 점유 프로그램이 있거나 확인할 수 없으면 준비를 거부한다. 개방 전후 `fuser`, pyserial exclusive와 Linux `TIOCEXCL`을 사용한다. 현장 방향키 시험·ROS 시리얼 브리지와 동시에 사용하지 않는다. 기존 센서 전용 서비스와 같은 MQTT ID로 동시에 실행하지 않는다.

아래는 **현장 담당자와 바퀴·날 격리를 확인한 뒤 적용할 절차**의 예시다. 홈 저장소를 직접 실행하는 배치이며, 아래 실제 설치 기록의 별도 배포 폴더를 사용할 때는 unit 경로를 바꿔야 한다. 새 웹·서버·장비 코드를 함께 적용하고 비공개 설정은 보존한다.

```bash
systemctl --user disable --now mower-telemetry.service
mkdir -p ~/.config/systemd/user
cp ~/autonomous-mower/edge/jetson-client/systemd/mower-control-gateway.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mower-control-gateway.service
journalctl --user -u mower-control-gateway.service -n 50 --no-pager
```

unit의 `Conflicts`로 동시 실행을 막는다. 이전 서비스를 disable하는 것은 재부팅 때 두 서비스가 함께 시작되는 것을 막기 위해서다. 로그인 전 자동 실행 여부는 기존 사용자 linger 설정에 따르며 이 절차에서 바꾸지 않는다. 정상 대기 때 포트 미점유, 웹 준비와 리모컨 확인, 별도 방향 누름·해제 정지를 최소 한 번 현장에서 검증한다. 재시작은 재개·이동을 복원하지 않는다. 웹 정지·비상 정지는 현장 리모컨 구동까지 차단한다는 뜻이 아니다.

기존 상태 전용 방식으로 돌아가려면 다음과 같이 전환한다. 자동 복구로 두 서비스를 함께 띄우지 않는다.

```bash
systemctl --user disable --now mower-control-gateway.service
systemctl --user enable --now mower-telemetry.service
```

### 2026-11-11 실제 설치 기록

사용자가 바퀴·날 격리와 현장 담당자 동행을 확인한 뒤 설치했다. Jetson 홈 저장소에 현장 수정본이 있어 직접 덮어쓰지 않고 `~/.local/share/mower-control-gateway/releases/7b4da6d/edge/jetson-client/`에 해당 커밋을 배치했다. 실제 사용자 unit의 작업·실행 경로도 이 폴더로 지정했다. 기존 비공개 설정을 배포 폴더에 복사해 권한 600으로 보관하고 `manual_serial.on_demand: true`와 `/dev/serial/by-id/<STM32_DEVICE>`를 설정했다. 기존 설정 원본과 팀 ROS 작업 공간은 보존했다.

`mower-control-gateway.service`가 active·enabled이며 사용자 `Linger=yes`를 확인했다. 부팅 후 로그인 없이 사용자 서비스가 시작되는 설정이다. 기존 `mower-telemetry.service`는 중지·자동 실행 해제했다. MQTT 연결과 명령 토픽 구독 요청 5개, 대기 중 STM32 포트 미점유, 기존 GPS·카메라·영상 서비스의 실행 유지를 확인했다. 실제 재부팅이나 새 서비스의 웹 재개·물리 동작은 시험하지 않았다. GPS 전용 드라이버의 부팅 자동 실행 설정은 이번에 바꾸지 않았다.

기존 PC 백엔드 JAR에는 준비 API가 없어 최신 코드를 별도로 빌드한 뒤 기존 실행 설정으로 교체·재시작하고 health `UP`을 확인했다. DB·MQTT 컨테이너와 공개 경로 설정은 유지했다. 웹은 새 준비 흐름이 포함된 버전이어야 하며 화면 새로고침만으로 배포 버전이 검증된 것은 아니다.

첫 배포는 Windows의 `core.autocrlf=true`가 `git archive` 출력의 실행 스크립트를 CRLF로 바꿔 시작에 실패했다. 기존 상태 서비스를 복구한 뒤 배포 스크립트를 LF로 정규화해 해결했다. 아카이브를 만들 때는 `git -c core.autocrlf=false archive ...`를 사용하고, 저장소에는 해당 실행기의 `text eol=lf` 규칙을 추가했다. `bash -n`만으로는 `set -eo pipefail` 인수 뒤 CR 문자를 발견하지 못하므로 실제 파일 바이트와 실행 결과도 확인한다.

장비의 `~/.local/share/mower-control-gateway/installation.json`에는 배포 경로·이전 서비스 상태·설정 원본 해시·실행기 해시를, `verification.json`에는 설치 확인 결과를 기록했다. 같은 폴더의 `before-<설치시각>/`에는 이전 상태 서비스 unit을 보관했다. 비밀번호나 토큰은 이 기록에 넣지 않았다. 복구는 위의 새 서비스 중지·비활성화와 기존 상태 서비스 활성화 절차를 따른다. PC에서 이후 코드를 푸시해도 이 배포본이 자동 갱신되지는 않는다.

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
## AUTO 실행 관리의 PC 준비

기존 `change-mode` 명령의 `parameters.mode=autonomous` 경로에서 `AutonomyExecution`에 실행을 요청한다. 별도 작업 시작 MQTT 토픽은 추가하지 않았다. 실행 프로그램은 장비의 설정 파일 `autonomy.command`에 문자열 목록으로 지정하며, MQTT payload의 실행 파일·명령 문자열은 사용하지 않는다. `shell=False`로 실행하고 실행 파일은 절대 경로만 허용한다. 이 설정은 신뢰할 수 있는 장비 관리자만 수정해야 한다.

예제 설정은 `autonomy.command: []`로 비활성이다. 준비 확인 어댑터도 연결되지 않아 `_autonomy_ready=None`으로 시작한다. 명령만 설정해도 실제 AUTO가 실행되지는 않는다. 미설정·준비 미확인·준비 실패는 거부 응답이며, 기존처럼 소프트웨어 모드만 바꿔 AUTO 요청을 성공으로 응답하지 않는다. 실제 준비 기준과 스크립트 경로는 장비·팀원 확인 후 연결해야 한다.

프로세스 생성 성공은 `accepted / autonomy-process-started`, 상태는 `awaiting-start`다. 이는 주행 시작이나 명령 완료를 의미하지 않으며 작업 거리를 만들지 않는다. 현재 AUTO와 작업 시작 버튼은 같은 모드 요청을 보내므로 둘 다 이 처리의 영향을 받는다. 이미 실행 중이면 거부하고 종료가 확인되지 않은 작업의 재시작도 거부한다. 프로세스가 정상 종료해도 실제 작업 종료로 추정하지 않는다.

`confirm_started(run_id, at)`, `observe(run_id, at)`, `confirm_ended(run_id, at)`는 향후 실제 상태 신호 어댑터를 위한 내부 확인 지점이다. 확인된 신호만 작업·신호 UUID를 포함한 콜백으로 전달한다. 현재 콜백은 외부 전송에 연결하지 않았으며 서버 작업 이력·GPS 입력에 자동 반영되지 않는다. 어댑터는 로봇 ID, GPS 실제 측정 시각, 정상 종료의 의미와 인증 계약을 확정한 후 연결해야 한다. 시작 미확인·프로세스 소실 후 종료 미확인 상태의 복구 방식도 실제 계약 확인 대상이다.

stop, E-Stop과 다른 모드·수동 요청은 관리 중인 프로세스의 종료를 요청한다. POSIX에서는 별도 프로세스 그룹을 생성해 그룹에 종료 신호를 보내고, Windows 모의 시험에서는 직접 실행한 프로세스를 종료한다. E-Stop의 기존 출력과 로컬 비상 상태 설정은 프로세스 정리보다 먼저 수행한다. 프로세스 종료는 기체·날·현장 리모컨의 물리 정지 확인이 아니다. 스크립트가 별도 세션을 만들거나 다른 서비스를 실행하는 경우까지 정리된다고 가정하지 않으며 실제 정지·카메라·시리얼 소유 계약 확인 전에는 적용하지 않는다.

ROS와 장비 없이 모의 프로그램으로 검사하려면 `requirements.txt`가 설치된 가상 환경에서 다음을 실행한다.

```powershell
$env:PYTHONPATH=(Resolve-Path edge/jetson-client).Path
python -m unittest discover -s edge/jetson-client/tests -p test_autonomy.py -v
```

저장소 루트 기준이다. `tests/fixtures/autonomy_mock.py`는 장비·ROS·MQTT에 접근하지 않고 대기한 뒤 지정 코드로 종료한다. Linux 프로세스 그룹 처리는 테스트 대역으로 확인하며 실제 Jetson의 프로세스·시리얼·중재·정지는 별도 검증 대상이다. 이 코드를 장비에 배포하거나 기존 모니터를 중지하지 않았다.
## 웹 작업 구역의 별도 준비 파일

기존 Jetson의 `mower_test.sh`는 5×5m 시험용 원본으로 보존한다. 새 `scripts/prepare-web-work-zone.sh`와 `jetson_mower_client/web_work_zone.py`는 웹 저장 구역을 별도 JSON으로 준비한다. 주행 스크립트의 복사본이나 자동 출발 실행기가 아니며 ROS·시리얼·카메라·기존 구역 파일을 조작하지 않는다. 실제 다각형 주행 경로와 비전 지도 표시의 연결은 후속 작업이다.

팀원 YOLO의 실험 출력에 대한 내부 해석기는 `jetson_mower_client/vision_observation.py`다. `parse_frame`은 사람의 카메라 좌표 후보와 깊이 없음·잘못된 입력·사람 없음을 구분하며 `parse_status`는 수신된 카메라·비전 시간 초과를 분리한다. `0.1-experimental`과 `camera_color_optical_frame`만 처리하고 촬영 시각은 검증되지 않은 ROS 헤더 값으로 보존한다. ROS 구독과 heartbeat 미수신 감시, GPS 지도 변환·서버 전송·기존 저장 서비스 연결은 없다. 3D 매칭 성공만으로 실제 위치 정확도나 안전을 보증하지 않는다.

필요한 의존성은 별도 가상 환경에서 `python -m pip install -r requirements-work-zone.txt`로 설치한다. 다각형 검증에는 Shapely를 사용하며 Jetson의 Python·시스템 패키지 호환성은 실제 적용 전에 확인한다. 기존 상태 전송 클라이언트만 실행할 때는 기존 `requirements.txt`를 사용한다.

기존 작업 구역 조회 API 응답 파일을 사용하려면 패키지 디렉터리에서 다음과 같이 실행한다.

```bash
python3 -m jetson_mower_client.web_work_zone \
  --response-file /path/to/work-zone-response.json \
  --robot-id '<ROBOT_ID>' --expected-version 3 \
  --output /path/to/web-work-zone-v3.json
```

Linux에서는 `bash scripts/prepare-web-work-zone.sh` 뒤에 같은 인수를 지정해도 된다. 인수의 버전은 사용자가 확인한 실제 웹 구역 버전이다. 파일 입력은 기존 `GET /api/robots/{robotId}/work-zone`의 전체 응답(`success`, `data`) 형식이며 좌표는 GeoJSON 순서 `[경도, 위도]`다. 로봇·구역 ID와 버전, WGS84 Polygon, 닫힌 고리와 자기 교차·내부 제외 구역의 유효성을 확인한다. 도형을 사각형으로 바꾸거나 자동 복구하지 않는다.

서버에서 직접 조회하려면 `--response-file` 대신 `--api-base-url https://<BACKEND_HOST>`를 지정하고 `WORK_ZONE_API_TOKEN` 환경변수에 해당 서버의 `robots:read` 권한이 있는 단기 인증 토큰을 설정한다. 토큰은 명령줄·문서·Git에 넣지 않는다. HTTPS 인증서 검증은 유지하며 리다이렉트는 거부한다. 로그인·토큰 발급·갱신을 이 실행기에서 대신하지 않으며 실제 장비 계정의 인증 방식은 담당자와 정해야 한다.

결과에는 구역 ID·버전·원본 도형·SHA-256과 `status=prepared`를 저장한다. 조회한 시점의 스냅샷이며 이후 웹 변경을 자동 반영하지 않는다. 실제 적용 전 최신 버전과 일치하는지 다시 확인할 계약이 필요하다. 기존 출력 파일과 `boundary.json`이라는 이름은 거부하므로 확인할 새 구역은 새 이름으로 저장한다. POSIX에서는 소유자만 읽는 권한으로 생성하며, 위치 정보의 저장 기간과 파일 접근 권한을 관리해야 한다. 준비 성공은 실제 경로 안전성·GPS 준비 완료·주행 승인·예초 완료를 의미하지 않는다.

검사는 저장소 루트에서 `PYTHONPATH`를 `edge/jetson-client`로 지정하고 `python -m unittest discover -s edge/jetson-client/tests -p test_web_work_zone.py -v`를 실행한다. 구역 처리와 실제 CLI 파일 생성을 PC에서 검사했고 인증 HTTP 조회는 대역 검사다. 실제 서버·Jetson 수신, Linux 셸 래퍼 실행과 주행·비전 표시는 아직 검증하지 않았다.


## 웹에서 확인한 예정 경로의 준비

웹의 예정 경로 생성은 `/api/robots/{robotId}/work-zone/cpp-preview/plans`로 요청하고 서버가 보관한 원본과 같은 경로를 표시한다. 화면에 표시된 경로 ID를 사용한다. 서버는 구역 ID·버전과 경로·격자·계산 프로필을 한 원문에 묶어 V15 `route_plan`에 보관한다. Jetson은 경로를 다시 계산하지 않는다.

`requirements-work-zone.txt`의 의존성을 설치한 Python과 이 저장소의 `PYTHONPATH`를 사용한다. 서버·웹 적용과 인증 토큰 준비는 별도로 필요하다.

```bash
python3 -m jetson_mower_client.web_route_plan \
  --api-base-url https://<API_HOST> --robot-id <ROBOT_ID> \
  --expected-version <ZONE_VERSION> --plan-id <PLAN_ID> \
  --output web-route-<PLAN_ID>.json
```

토큰은 기존 `WORK_ZONE_API_TOKEN` 환경변수로 제공하며 명령에 넣지 않는다. HTTPS 인증서 검증·리다이렉트 거부와 기존 서버의 `robots:read` 권한을 적용한다. 장비 전용 HTTP 인증의 운영 방식은 아직 확정하지 않았다. 오프라인에서는 `--api-base-url` 대신 `--response-file <GET_RESPONSE_JSON>`으로 같은 준비 검사를 실행한다. 오프라인 파일은 서버의 현재 버전을 확인할 수 없다.

조회 API는 로봇과 현재 구역 ID·버전 일치를 확인하고, 준비 코드는 기대 경로 ID·원문 SHA-256·구역과 경로의 식별 정보·좌표·경계와 차체 외접원 여유를 검사한다. 해시는 UTF-8 `payload` 문자열의 바이트를 대상으로 하며 JSON을 다시 직렬화하지 않는다. 해시는 인증을 대신하지 않는다. 성공하면 원문·해시·ID를 `route_prepared` 파일에 그대로 보존하고 터미널에 경로 ID를 출력한다. 기존 파일과 `boundary.json`은 덮어쓰지 않는다.

이번 단계는 파일 준비이며 실제 주행 준비 완료가 아니다. 서버 재시작 뒤에도 보관본은 DB에 남지만 자동 삭제·보관 기간은 아직 정하지 않았다. 빈 경로·한 점짜리 경로는 Jetson 준비에서 거부한다. 준비 후 구역이 변경될 수 있으므로 실제 실행 직전 최신 버전 재확인과 적용 중 변경 정책, 아래 파일 준비 보고와 별개인 장비 전용 준비 확인, AUTO 명령에 경로 ID를 붙이는 연결·작업 시작 신호·실제 추종기는 후속 작업이다. 기존 AUTO 동작이나 5×5 시험 스크립트를 교체하지 않는다. 실제 Jetson 배포·HTTPS 조회·물리 주행은 이번 검증에 포함하지 않았다.


### 파일 준비 보고와 웹 확인

사용자 합의에 따라 기존 HTTPS 로그인 토큰으로 보고한다. 조회에는 `robots:read`, 보고 POST에는 `control:write`가 필요하므로 아래 실행용 토큰에는 두 권한이 필요하다. 이는 준비 프로그램의 주장이고 장비 전용 신원 인증은 아니다. 실제 Jetson 준비·주행 승인이나 AUTO 허가에 사용하지 않는다.

먼저 `web_route_plan`으로 새 준비 파일을 생성한 뒤 같은 로봇·버전·경로 ID로 보고한다.

```bash
python3 -m jetson_mower_client.web_route_report \
  --api-base-url https://<API_HOST> --robot-id <ROBOT_ID> \
  --expected-version <ZONE_VERSION> --plan-id <PLAN_ID> \
  --prepared-file web-route-<PLAN_ID>.json
```

토큰은 `WORK_ZONE_API_TOKEN` 환경변수로만 제공한다. 보고기는 로컬 파일의 원문·해시·식별 정보·경계를 재검사하고 서버 GET으로 최신 구역과 원문을 확인한 뒤 SHA-256만 POST한다. HTTPS와 리다이렉트 거부를 유지한다. 실패해도 준비 파일을 변경하지 않으며 같은 파일로 재시도할 수 있다. 서버는 최초 수신 시각과 인증 계정을 기록하고 중복 보고로 덮어쓰지 않는다.

웹에서 해당 예정 경로를 생성한 뒤 `파일 준비 보고 확인`을 누르면 미수신·확인 실패·파일 준비 보고 수신을 구분해 표시한다. 수신 시각은 한국 시간이다. 자동 조회하지 않으며 재조회 전 표시가 최신임을 보장하지 않는다. 구역·로봇·경로 변경이나 편집·세션 변경 후 기존 확인 결과를 제거하고 늦은 응답을 버린다. 기록은 수신 시점의 보고이며 이후 파일 삭제·프로그램 종료·네트워크 단절을 감지하는 기능은 아니다. AUTO 실행·실제 장비 인증·추종기·주행 검증은 후속 단계다.


## 날 상태 입력 연결 전 팀원 확인 사항

면적 계산의 내부 입력은 `BladeObservation`이며 작업 ID·로봇 ID·신호 ID·실제 측정 시각과 상태 `ON/OFF/UNKNOWN`, 출처 `ROTATION/POWER/UNKNOWN`을 기록한다. `ROTATION`은 회전 관측, `POWER`는 전원/릴레이 관측이며 명령 수락이나 리모컨 스위치 요청을 실제 회전으로 바꾸지 않는다. 출처가 없으면 `UNKNOWN`만 허용한다. 실제 Jetson·STM32 수신기와 공개 쓰기 API·MQTT 토픽은 아직 연결하지 않았다.

팀원에게 본체 스위치와 리모컨 양쪽 조작을 모두 반영하는 신호가 있는지, 실제 회전인지 전원/릴레이 상태인지, 신호 장치·배선도·펌웨어 위치·ROS 타입이나 시리얼 형식·측정 시각·발행 주기와 단절 시 동작을 확인한다. 주기적 상태 관측을 전제로 3초 미수신을 확인 불가로 처리하므로, 변경 때 한 번만 발행한다면 heartbeat 또는 상태 조회를 먼저 설계해야 한다. 임의 재발행 시각으로 오래된 측정을 새 신호처럼 만들지 않는다.

예초 폭은 사용자 제공 0.650m이며 GPS 안테나와 날 중심의 오프셋·방향에 따른 보정, 신호 지연과 측정 시계 정합성은 후속 확인 대상이다. 아래 내용을 팀원에게 전달할 수 있다.

> 본체 스위치와 리모컨으로 날을 켰을 때 모두 반영되는 상태 신호를 찾고 있습니다. 실제 날 회전·전원·릴레이 중 무엇을 나타내는지, 관련 배선도/펌웨어 위치와 Jetson이 읽는 방법·값·주기·실제 측정 시각을 알려주세요. 신호가 없으면 회전 또는 전류 센서로 상태를 관측할 수 있는지도 확인 부탁드립니다. GPS 안테나와 날 중심의 위치 차이도 필요합니다. 기존 시동·날·주행 제어나 펌웨어를 임의로 바꾸려는 작업은 아닙니다.


## 이동 가능 범위와 경로 교체 상태 계약 (2026-11-08)

웹 저장 구역에 travelZone이 있으면 작업 구역 밖에서도 해당 이동 가능 범위 안의 진입 경로를 검토할 수 있다. 진입 경로를 담은 formatVersion=2/hd7000w-transit-v1 원문은 web_route_plan 준비기가 이동 가능 다각형·작업 구역 포함 관계·진입 경로의 차체 여유와 작업 경로 연결점을 검증한다. start는 현재 단계에서 검토용 좌표이며 실측 GPS나 주행 허가가 아니다. 이동 가능 범위 밖이거나 경로를 찾지 못하면 거부한다.

새 `mission.py`는 내부 상태 계약이며 ROS/MQTT/실행기와 아직 연결하지 않았다. 명시적 경로 확인→AUTO 요청→파일 준비→실제 준비 미확인과 실제 시작 확인을 분리한다. 구역 변경은 중단 요청을 발생시키고 해당 실행 ID·중단 요청 ID에 대응하는 실제 정지 확인이 있어야 최신 구역의 경로 재생성 콜백을 호출한다. 새 경로를 생성해도 확인·AUTO 요청을 다시 해야 한다. 명령 ACK·파일 보고·프로세스 종료로 실제 시작/정지 확인을 대신하지 않는다. 운영 어댑터에서 신호 출처·유효 시간·중복과 실행 중/재시작 복구를 확인한 뒤 연결해야 한다.

현재 웹은 선택한 planId를 AUTO에 포함하지만 서버의 실제 준비 확인 어댑터가 미연결이라 주행 명령 발행 전에 거부한다. mission 상태 계약과 구역 변경 이벤트는 실제 서버 저장 이벤트·Jetson 제어 경로에 아직 연결하지 않았으므로 실제 중단/재계획이 자동 실행되는 구현으로 해석하지 않는다. 실제 GPS/방향·제어권 중재·정지 증거·추종기와 현재 위치에서 첫 점까지의 실행 방식은 후속 장비 계약이다. 현장 리모컨 우선과 기존 5×5 스크립트를 유지하며 장비에 배포하지 않았다.
## 웹 수동 시리얼 연결 준비

방향키 시험 코드의 패킷과 같은 `$MODE,LPWM,RPWM,ENG,CS*` 형식을 별도 어댑터로 준비했다. 웹 버튼은 누른 동안만 입력을 반복하고 각 누름과 재개 세대를 구분한다. 첫 장비 시험의 합의에 따라 패킷 생성 단계에서 최대 PWM 편차를 100으로 제한하며 `ENG=0`은 명령값일 뿐 날의 실제 정지 상태가 아니다.

새 어댑터는 `manual_serial.port`가 없는 기본 설정에서 비활성이다. 시리얼 포트 독점과 실제 포트 식별, 모니터와 제어 클라이언트의 동일 MQTT client ID 충돌, 장비의 명령 구독·ACK 발행 권한을 해결하기 전 설정하거나 기동하지 않는다. 기존 ROS 브리지와 방향키 프로그램을 동시에 같은 포트에 연결하지 않는다. 기동·전환·배포는 장비 담당자와 절차를 확인한다.

기동 이후 리모컨 활성 진단을 적어도 한 번 수신하고 그 뒤 hold가 끝난 경우에만 재개를 허용한다. 최근 진단(`Remote active`와 hold 시간)이 없거나 활성 상태라면 재개를 거부한다. 리모컨 개입, 연결 종료, 시리얼 상태 유실 또는 입력 시간 초과는 이전 재개 세대와 입력을 폐기한다. 입력의 브라우저 발신 시각부터 0.35초를 사용하고 0.1초 주기로 출력한다. 클라이언트와 Jetson의 시계 차이나 스케줄러 지연이 있으면 수동 입력이 거부될 수 있으며 실제 0.5초 이내 정지는 아직 검증하지 않았다. 정상 포인터 해제는 해당 누름을 폐기하고 MANUAL 패킷을 사용한다. 리모컨 개입 후에는 화면의 재개 요청과 장비 ACK가 필요하며 정지된 누름의 늦은 패킷은 거부한다. 진단 시각은 Jetson 수신 시각이며 센서 원본 측정 시각이 아니다.

주기적 진단, 5초 hold와 실제 리모컨 우선 동작은 사용자 제공 펌웨어 및 담당자 확인에 근거한다. 2026-11-09에는 중립 상태의 진단 수신만 확인했다. 실제 리모컨 조작·웹 MQTT 명령·포트 독점·재연결·시계 차이·실제 PWM·물리 정지·전체 E-Stop은 검증하지 않았다. 웹 정지·E-Stop은 현장 리모컨의 구동 차단을 보장하지 않는다. 이 코드는 현장 검증 전 배포하거나 실제 구동에 사용하지 않는다.
