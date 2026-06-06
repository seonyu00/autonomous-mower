# 긴급 정지

긴급 정지(E-Stop)는 일반 제어권과 무관하게 허용되며 일반 명령보다 높은 우선순위로 처리되어야 한다.

## 처리 순서

```text
EmergencyStopButton
  -> POST /api/control/<ROBOT_ID>/estop
  -> EmergencyStopService
  -> commands/estop (QoS 1)
  -> Jetson emergency state
  -> /cmd_vel = 0
  -> /mower/set_mode = EMERGENCY
  -> /mower/engine = false
```

## 요청 예제

```http
POST /api/control/<ROBOT_ID>/estop
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "idempotencyKey": "estop-example-001",
  "reason": "operator requested emergency stop"
}
```

## 안전 규칙

- 현재 제어권 소유자가 아니어도 `control:write` 권한이 있으면 E-Stop을 실행할 수 있다.
- 긴급 상태에서는 수동 조종, 모드 전환, 작업 장치 명령을 거부한다.
- E-Stop 해제 후 이전 명령을 자동 재개하지 않는다.

## 확인된 위험

현재 reset API는 백엔드의 긴급 상태만 해제한다. Jetson으로 reset MQTT 명령을 보내는 계약이 없어 백엔드는 정상인데 Jetson은 계속 긴급 상태인 불일치가 발생할 수 있다.

또한 백엔드는 긴급 상태를 먼저 변경한 뒤 MQTT를 발행한다. MQTT 발행 실패 시 서버 상태만 긴급 정지로 바뀔 수 있으므로 장비 상태 ACK를 포함한 재시도·확인 절차가 필요하다.
