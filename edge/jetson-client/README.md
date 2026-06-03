# Jetson Edge Client

Jetson Orin Nano에서 Spring Boot 백엔드의 MQTT command topic을 구독하고 ROS 2 topic으로 넘기는 edge client skeleton입니다.

현재 Phase 1 범위는 MQTT와 ROS 2 사이의 연결 골격입니다. STM32 USB CDC serial 처리는 이 패키지에서 하지 않습니다. `/cmd_vel`을 구독하는 별도 Jetson bridge node가 STM32 NUCLEO-F439ZI(`/dev/ttyACM0`, 115200bps)로 전달한다고 가정합니다.

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

예시 설정 파일을 복사해서 로컬 값으로 수정합니다.

```bash
cp config.yaml.example config.yaml
```

주요 값:

- `robot_id`: MQTT topic의 `{robotId}`와 payload `robotId`
- `mqtt.broker_url`: MQTT broker URL
- `ros.cmd_vel_topic`: 주행 명령 publish topic. 기본값은 `/cmd_vel`
- `ros.cmd_vel_qos_depth`: `/cmd_vel` publisher의 `keep_last` depth. 기본값은 `10`
- `ros.cmd_vel_qos_durability`: `/cmd_vel` publisher durability. 기본값은 `volatile`
- `ros.cmd_vel_qos_reliability`: `/cmd_vel` publisher reliability. 기본값은 `reliable`
- `ros.fix_topic`: GPS 구독 skeleton topic. 기본값은 `/fix`
- `ros.imu_topic`: IMU 구독 skeleton topic. 기본값은 `/camera/imu`

## 실행

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
