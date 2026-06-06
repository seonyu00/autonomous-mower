# 백엔드 제어 안전 참고 사항

이 문서는 현재 백엔드와 Jetson Edge Client에 구현된 제어 안전 범위와 실제 장비 연동 전까지 남은 제한을 정리한다.

## 현재 구현 범위

- 제어권(Control Lock)과 긴급 상태는 `robotId` 기준으로 백엔드 process memory에 저장한다.
- 긴급 정지(E-Stop)를 활성화하면 백엔드는 MQTT `commands/estop`에 QoS 1로 명령을 발행하고 STOMP 상태를 갱신한다.
- 데드맨 스위치(Deadman Switch)는 마지막 manual/stop 명령을 기록하고, 100ms 주기로 500ms timeout을 평가한다.
- 백엔드 데드맨 timeout이 발생하면 MQTT `commands/stop`에 system stop을 발행하고 STOMP `control-events`에도 synthetic stop event를 발행한다.
- Jetson Edge Client는 수동 주행 중 500ms 동안 새 명령이 없으면 로컬 `/cmd_vel` 정지 출력을 발행한다.
- Jetson Edge Client는 E-Stop 수신 시 `/cmd_vel` 정지, `/mower/set_mode` emergency, `/mower/engine` false를 순서대로 발행하고 일반 명령을 거부한다.

## 아직 보장되지 않는 범위

- STM32 USB CDC serial bridge와 실제 drive PWM 중립 출력은 이 저장소에 구현되어 있지 않다.
- STM32가 자체적으로 명령 TTL을 검사하고 통신 두절 시 PWM을 중립으로 복귀시키는 하드웨어 fail-safe는 구현 및 실장 검증이 필요하다.
- mower blade와 relay의 실제 차단 여부는 Jetson ROS 2 topic 이후의 하드웨어 bridge 구현에 달려 있다.
- STM32 ACK가 백엔드의 command completion 상태까지 연결되는 흐름은 아직 구현되지 않았다.
- 긴급 상태 초기화는 현재 백엔드 상태만 복구한다. Jetson에 명시적인 reset 명령을 전달하는 MQTT 계약은 없다.

## 운용 제한

- In-memory 제어 상태는 백엔드가 재시작되면 사라진다.
- In-memory 제어 상태는 여러 백엔드 instance 사이에 공유되지 않는다.
- production 배포에서는 제어권, 긴급 상태, 명령 sequence, idempotency record를 공유 transactional store로 옮겨야 한다.
- production 배포에서는 로봇별 lock 만료와 데드맨 timeout을 평가하는 safety authority가 하나만 동작하도록 보장하거나 distributed locking을 사용해야 한다.
- 실제 장비 안전성은 백엔드와 Jetson 동작만으로 확정할 수 없다. STM32 firmware, motor controller, blade relay를 포함한 장비 시험이 필요하다.

## 초기화 정책

- 긴급 정지 활성화에는 `control:write`가 필요하며 현재 제어권을 들고 있을 필요는 없다.
- 긴급 상태 초기화에도 `control:write`가 필요하다.
- 제어권 소유자가 있으면 해당 소유자 또는 `control:takeover` 권한 사용자만 초기화할 수 있다.
- 소유자가 없으면 인증된 `control:write` 사용자가 안전 상태를 확인한 뒤 초기화할 수 있다.
- 초기화 이후에도 이전 주행이나 작업 장치 출력을 자동으로 재개해서는 안 된다.
