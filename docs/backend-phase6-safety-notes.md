# 백엔드 Phase 6 안전 참고 사항

Phase 6의 제어 안전 상태는 아직 Mock 백엔드 기반입니다.

## 현재 범위

- 제어권(Control Lock) 상태는 `robotId` 기준으로 process memory에 저장한다.
- 긴급 상태도 `robotId` 기준으로 process memory에 저장한다.
- 데드맨 스위치(Deadman Switch) timeout은 현재 STOMP `control-events`로 서버 측 synthetic stop event만 발행한다.
- 이 phase에서는 MQTT, Jetson, STM32, motor, blade, relay, hardware fail-safe 명령까지는 보내지 않는다.

## 운용 제한

- In-memory 제어 상태는 백엔드가 재시작되면 사라진다.
- In-memory 제어 상태는 여러 백엔드 instance 사이에 공유되지 않는다.
- production 배포에서는 제어권(Control Lock), 긴급 상태, 명령 sequence, idempotency record를 공유 transactional store로 옮겨야 한다.
- production 배포에서는 로봇별 lock 만료와 데드맨 스위치(Deadman Switch) timeout을 평가하는 safety authority가 하나만 동작하도록 보장하거나 distributed locking을 사용해야 한다.
- 이 phase의 데드맨 스위치(Deadman Switch) timeout event는 관측용 skeleton이다. 실제 hardware stop 출력은 MQTT/edge/STM32 통합이 필요하다.

## 초기화 정책

- 긴급 정지(E-Stop) 활성화에는 `control:write`가 필요하다. 현재 제어권(Control Lock)을 들고 있을 필요는 없다.
- 긴급 상태 초기화에도 `control:write`가 필요하다.
- 제어권 소유자가 있으면 해당 소유자 또는 `control:takeover` 권한 사용자만 초기화할 수 있다.
- 소유자가 없으면 인증된 `control:write` 사용자가 안전 상태를 확인한 뒤 초기화할 수 있다.
